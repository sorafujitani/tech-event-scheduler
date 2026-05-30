import type { FullSnapshot } from "@app/shared";
import { Hono } from "hono";
import { INTERNAL_WS_PATH } from "../durable/protocol";
import { DomainError } from "../errors";
import { callRoom, eventRoomStub } from "../lib/do";
import { issueWsTicket } from "../lib/ticket";
import type { MemberEnv } from "../middleware/types";

// eventScoped 配下に "/" でマウントされ requireEventMember("manager") 済み。
export const liveRoutes = new Hono<MemberEnv>()
  .get("/live", async (c) => {
    const r = await callRoom(c.env, c.req.param("eventId")!, {
      type: "snapshot.get",
    });
    if (r.type !== "snapshot")
      throw new DomainError("INTERNAL", "snapshot failed");
    return c.json(r.payload satisfies FullSnapshot);
  })
  .post("/ws-ticket", async (c) => {
    const ticket = await issueWsTicket(c.env, {
      eventId: c.req.param("eventId")!,
      userId: c.var.member.userId,
      role: c.var.member.role,
    });
    return c.json({ ticket, expiresInSec: 60 } as const);
  })
  .get("/ws", (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      throw new DomainError("BAD_REQUEST", "expected websocket");
    }
    const eventId = c.req.param("eventId")!;
    const stub = eventRoomStub(c.env, eventId);
    const u = new URL(c.req.url);
    // C1: 元 URL の search(?ticket=) を内部 URL に保持し、ticket を x-ws-ticket ヘッダへ移送して DO へ。
    const req = new Request(`https://room${INTERNAL_WS_PATH}${u.search}`, c.req.raw);
    req.headers.set("x-event-id", eventId);
    req.headers.set(
      "x-conn-meta",
      JSON.stringify({
        userId: c.var.member.userId,
        role: c.var.member.role,
      }),
    );
    const ticket = u.searchParams.get("ticket");
    if (ticket) req.headers.set("x-ws-ticket", ticket);
    return stub.fetch(req);
  });
