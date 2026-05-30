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
    await scheduleRepo.deleteItem(db, c.req.param("itemId")!);
    return c.json({ ok: true } as const);
  });
// Phase2: .route("/:itemId/timer", timerRoutes) で /schedule/:itemId/timer/* を実現（C2）
