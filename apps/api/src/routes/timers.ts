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

type TimerCommandInput =
  | {
      type:
        | "timer.start"
        | "timer.pause"
        | "timer.resume"
        | "timer.complete"
        | "timer.skip";
    }
  | { type: "timer.extend"; deltaSec: number };

async function callTimer(
  c: Context<MemberEnv>,
  input: TimerCommandInput,
  idempotencyKey: string,
) {
  const shared = {
    // マウント元 "/:itemId/timer" のパラメータは sub-router の型に出ないため non-null を明示。
    itemId: c.req.param("itemId")!,
    actorUserId: c.var.member.userId,
    idempotencyKey,
  };
  const cmd: RoomCommand =
    input.type === "timer.extend"
      ? { type: "timer.extend", deltaSec: input.deltaSec, ...shared }
      : { type: input.type, ...shared };
  const r = await callRoom(c.env, c.var.eventId, cmd);
  return c.json({
    timer: r.type === "timer" ? r.payload : null,
    version: r.version,
  });
}

export const timerRoutes = new Hono<MemberEnv>()
  .post("/start", idem, (c) =>
    callTimer(c, { type: "timer.start" }, c.req.valid("header")["idempotency-key"]),
  )
  .post("/pause", idem, (c) =>
    callTimer(c, { type: "timer.pause" }, c.req.valid("header")["idempotency-key"]),
  )
  .post("/resume", idem, (c) =>
    callTimer(c, { type: "timer.resume" }, c.req.valid("header")["idempotency-key"]),
  )
  .post("/complete", idem, (c) =>
    callTimer(c, { type: "timer.complete" }, c.req.valid("header")["idempotency-key"]),
  )
  .post("/skip", idem, (c) =>
    callTimer(c, { type: "timer.skip" }, c.req.valid("header")["idempotency-key"]),
  )
  .patch(
    "/extend",
    idem,
    zValidator("json", z.object({ deltaSec: z.number().int() })),
    (c) =>
      callTimer(
        c,
        { type: "timer.extend", deltaSec: c.req.valid("json").deltaSec },
        c.req.valid("header")["idempotency-key"],
      ),
  );
