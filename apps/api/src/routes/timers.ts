import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { RoomCommand } from "../durable/protocol";
import { callRoom } from "../lib/do";
import type { MemberEnv } from "../middleware/types";
import { idempotencyHeaderSchema } from "../schemas/idempotency";

// scheduleRoutes の "/:itemId/timer" 配下にマウントされ :eventId/:itemId を継承（C2）。
// 親 scheduleRoutes で requireEventMember("manager") 済み。Idempotency-Key は header validator で RPC 型に露出（M1）。
const idem = zValidator("header", idempotencyHeaderSchema);

async function callTimer(
  c: Context<MemberEnv>,
  type: "timer.start" | "timer.pause" | "timer.resume" | "timer.complete" | "timer.skip",
  idempotencyKey: string,
) {
  const cmd: RoomCommand = {
    type,
    itemId: c.req.param("itemId")!,
    actorUserId: c.var.member.userId,
    idempotencyKey,
  };
  const r = await callRoom(c.env, c.req.param("eventId")!, cmd);
  return c.json({
    timer: r.type === "timer" ? r.payload : null,
    version: r.version,
  });
}

export const timerRoutes = new Hono<MemberEnv>()
  .post("/start", idem, (c) =>
    callTimer(c, "timer.start", c.req.valid("header")["idempotency-key"]),
  )
  .post("/pause", idem, (c) =>
    callTimer(c, "timer.pause", c.req.valid("header")["idempotency-key"]),
  )
  .post("/resume", idem, (c) =>
    callTimer(c, "timer.resume", c.req.valid("header")["idempotency-key"]),
  )
  .post("/complete", idem, (c) =>
    callTimer(c, "timer.complete", c.req.valid("header")["idempotency-key"]),
  )
  .post("/skip", idem, (c) =>
    callTimer(c, "timer.skip", c.req.valid("header")["idempotency-key"]),
  )
  .patch(
    "/extend",
    idem,
    zValidator("json", z.object({ deltaSec: z.number().int() })),
    async (c) => {
      const r = await callRoom(c.env, c.req.param("eventId")!, {
        type: "timer.extend",
        itemId: c.req.param("itemId")!,
        deltaSec: c.req.valid("json").deltaSec,
        actorUserId: c.var.member.userId,
        idempotencyKey: c.req.valid("header")["idempotency-key"],
      });
      return c.json({
        timer: r.type === "timer" ? r.payload : null,
        version: r.version,
      });
    },
  );
