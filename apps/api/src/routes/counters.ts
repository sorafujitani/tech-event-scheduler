import { createDb } from "@app/db";
import { serializeRow } from "@app/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { callRoom } from "../lib/do";
import type { MemberEnv } from "../middleware/types";
import * as countersRepo from "../repo/counters";
import { adjustSchema } from "../schemas/counters";
import { idempotencyHeaderSchema } from "../schemas/idempotency";

const idem = zValidator("header", idempotencyHeaderSchema);

// MVP は既定の "main" カウンタ（イベント作成時に生成）を対象とする。
// カウンタの新規作成/削除（複数ゲート）は DO 登録の同期が要るため後続フェーズへ。
export const counterRoutes = new Hono<MemberEnv>()
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const rows = await countersRepo.listCounters(db, c.req.param("eventId")!);
    return c.json(rows.map(serializeRow));
  })
  .post(
    "/:counterId/adjust",
    idem,
    zValidator("json", adjustSchema),
    async (c) => {
      const r = await callRoom(c.env, c.req.param("eventId")!, {
        type: "counter.adjust",
        counterId: c.req.param("counterId")!,
        delta: c.req.valid("json").delta,
        actorUserId: c.var.member.userId,
        idempotencyKey: c.req.valid("header")["idempotency-key"],
      });
      return c.json({
        counter: r.type === "counter" ? r.payload : null,
        version: r.version,
      });
    },
  )
  .post("/:counterId/reset", idem, async (c) => {
    const r = await callRoom(c.env, c.req.param("eventId")!, {
      type: "counter.reset",
      counterId: c.req.param("counterId")!,
      actorUserId: c.var.member.userId,
      idempotencyKey: c.req.valid("header")["idempotency-key"],
    });
    return c.json({
      counter: r.type === "counter" ? r.payload : null,
      version: r.version,
    });
  });
