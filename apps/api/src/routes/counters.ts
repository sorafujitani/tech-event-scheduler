import { createDb } from "@app/db";
import { serializeRow } from "@app/shared";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import type { RoomCommand } from "../durable/protocol";
import { callRoom } from "../lib/do";
import type { MemberEnv } from "../middleware/types";
import * as countersRepo from "../repo/counters";
import { adjustSchema } from "../schemas/counters";
import { idempotencyHeaderSchema } from "../schemas/idempotency";

const idem = zValidator("header", idempotencyHeaderSchema);

type CounterCommandInput =
  | { type: "counter.adjust"; delta: number }
  | { type: "counter.reset" };

async function callCounter(
  c: Context<MemberEnv>,
  input: CounterCommandInput,
  counterId: string,
  idempotencyKey: string,
) {
  const shared = { counterId, actorUserId: c.var.member.userId, idempotencyKey };
  const cmd: RoomCommand =
    input.type === "counter.adjust"
      ? { type: "counter.adjust", delta: input.delta, ...shared }
      : { type: "counter.reset", ...shared };
  const r = await callRoom(c.env, c.var.eventId, cmd);
  return c.json({
    counter: r.type === "counter" ? r.payload : null,
    version: r.version,
  });
}

// MVP は既定の "main" カウンタ（イベント作成時に生成）を対象とする。
// カウンタの新規作成/削除（複数ゲート）は DO 登録の同期が要るため後続フェーズへ。
export const counterRoutes = new Hono<MemberEnv>()
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const rows = await countersRepo.listCounters(db, c.var.eventId);
    return c.json(rows.map(serializeRow));
  })
  .post(
    "/:counterId/adjust",
    idem,
    zValidator("json", adjustSchema),
    (c) =>
      callCounter(
        c,
        { type: "counter.adjust", delta: c.req.valid("json").delta },
        c.req.param("counterId"),
        c.req.valid("header")["idempotency-key"],
      ),
  )
  .post("/:counterId/reset", idem, (c) =>
    callCounter(
      c,
      { type: "counter.reset" },
      c.req.param("counterId"),
      c.req.valid("header")["idempotency-key"],
    ),
  );
