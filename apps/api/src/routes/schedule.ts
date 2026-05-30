import { createDb } from "@app/db";
import { serializeRow } from "@app/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { DomainError } from "../errors";
import { requireEventMember } from "../middleware/event";
import type { MemberEnv } from "../middleware/types";
import * as scheduleRepo from "../repo/schedule";
import {
  createScheduleItemSchema,
  patchScheduleItemSchema,
  reorderSchema,
} from "../schemas/schedule";
import { timerRoutes } from "./timers";

export const scheduleRoutes = new Hono<MemberEnv>()
  .use(requireEventMember("manager"))
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const rows = await scheduleRepo.listItems(db, c.req.param("eventId")!);
    return c.json(rows.map(serializeRow));
  })
  .post("/", zValidator("json", createScheduleItemSchema), async (c) => {
    const db = createDb(c.env.DB);
    const item = await scheduleRepo.createItem(
      db,
      c.req.param("eventId")!,
      c.req.valid("json"),
    );
    return c.json(serializeRow(item), 201);
  })
  .post("/reorder", zValidator("json", reorderSchema), async (c) => {
    const db = createDb(c.env.DB);
    const rows = await scheduleRepo.reorder(
      db,
      c.req.param("eventId")!,
      c.req.valid("json").orderedItemIds,
    );
    return c.json(rows.map(serializeRow));
  })
  .patch("/:itemId", zValidator("json", patchScheduleItemSchema), async (c) => {
    const db = createDb(c.env.DB);
    const item = await scheduleRepo.patchItem(
      db,
      c.req.param("itemId")!,
      c.req.valid("json"),
    );
    if (!item) throw new DomainError("NOT_FOUND", "schedule item not found");
    return c.json(serializeRow(item));
  })
  .delete("/:itemId", async (c) => {
    const db = createDb(c.env.DB);
    // 進行中/一時停止中は削除拒否（status は DO write-through で D1 に反映済み）。
    const item = await scheduleRepo.getItem(db, c.req.param("itemId")!);
    if (!item) throw new DomainError("NOT_FOUND", "schedule item not found");
    if (item.status === "running" || item.status === "paused") {
      throw new DomainError("CONFLICT", "cannot delete an active item");
    }
    await scheduleRepo.deleteItem(db, c.req.param("itemId")!);
    return c.json({ ok: true } as const);
  })
  // /schedule/:itemId/timer/{start,...} を実現（C2）
  .route("/:itemId/timer", timerRoutes);
