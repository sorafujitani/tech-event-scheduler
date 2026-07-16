import { createDb } from "@app/db";
import { serializeRow } from "@app/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { DomainError } from "../errors";
import { requireSession } from "../middleware/auth";
import { requireEventMember } from "../middleware/event";
import type { AuthedEnv, MemberEnv } from "../middleware/types";
import * as eventsRepo from "../repo/events";
import { createEventSchema, patchEventSchema } from "../schemas/events";
import { counterRoutes } from "./counters";
import { liveRoutes } from "./live";
import { memberRoutes } from "./members";
import { scheduleRoutes } from "./schedule";

// owner 限定操作だけを束ねる専用サブルーター（最小権限を route で表現）。
const ownerScoped = new Hono<MemberEnv>()
  .use(requireEventMember("owner"))
  .delete("/", async (c) => {
    const db = createDb(c.env.DB);
    await eventsRepo.archiveEvent(db, c.var.eventId);
    return c.json({ ok: true } as const);
  });

// manager 以上で読める/書ける範囲。
const eventScoped = new Hono<MemberEnv>()
  .use(requireEventMember("manager"))
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const detail = await eventsRepo.getEventDetail(db, c.var.eventId);
    if (!detail) throw new DomainError("NOT_FOUND", "event not found");
    return c.json({
      event: serializeRow(detail.event),
      members: detail.members.map(serializeRow),
      items: detail.items.map(serializeRow),
      counters: detail.counters.map(serializeRow),
      modules: detail.modules.map(serializeRow),
    });
  })
  .patch("/", zValidator("json", patchEventSchema), async (c) => {
    const db = createDb(c.env.DB);
    const updated = await eventsRepo.patchEvent(
      db,
      c.var.eventId,
      c.req.valid("json"),
    );
    if (!updated) throw new DomainError("NOT_FOUND", "event not found");
    return c.json(serializeRow(updated));
  })
  .route("/", ownerScoped) // DELETE / は owner 専用
  .route("/members", memberRoutes)
  .route("/schedule", scheduleRoutes)
  .route("/counters", counterRoutes)
  .route("/", liveRoutes); // /live, /ws-ticket, /ws

export const eventRoutes = new Hono<AuthedEnv>()
  .use(requireSession) // 既存ミドルウェア再利用
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const rows = await eventsRepo.listEventsForUser(db, c.var.user.id);
    return c.json(rows.map(serializeRow));
  })
  .post("/", zValidator("json", createEventSchema), async (c) => {
    const db = createDb(c.env.DB);
    const created = await eventsRepo.createEventWithOwner(
      db,
      c.var.user.id,
      c.req.valid("json"),
    );
    return c.json(created, 201);
  })
  .route("/:eventId", eventScoped);
