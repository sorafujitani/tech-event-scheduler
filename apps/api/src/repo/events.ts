import type { Database } from "@app/db";
import {
  attendanceCounter,
  event,
  eventMember,
  eventModule,
  scheduleItem,
} from "@app/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { CreateEventInput, PatchEventInput } from "../schemas/events";
import { newId, nowDate } from "./ids";

// 作成 = batch で event + owner member + 既定モジュール(timetable/attendance) + 既定 counter を原子生成。
export async function createEventWithOwner(
  db: Database,
  ownerUserId: string,
  input: CreateEventInput,
) {
  const now = nowDate();
  const eventId = newId();
  await db.batch([
    db.insert(event).values({
      id: eventId,
      createdByUserId: ownerUserId,
      title: input.title,
      timezone: input.timezone ?? "Asia/Tokyo",
      startsAtMs: input.startsAtMs ?? null,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(eventMember).values({
      id: newId(),
      eventId,
      userId: ownerUserId,
      role: "owner",
      status: "active",
      invitedByUserId: ownerUserId,
      invitedAt: now,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(eventModule).values({
      id: newId(),
      eventId,
      moduleType: "timetable",
      enabled: true,
      orderIndex: 0,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(eventModule).values({
      id: newId(),
      eventId,
      moduleType: "attendance",
      enabled: true,
      orderIndex: 1,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(attendanceCounter).values({
      id: newId(),
      eventId,
      name: "main",
      currentValue: 0,
      lastSeq: 0,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return { eventId };
}

// 詳細 = batch で 5 本を 1 往復に束ねて N+1 回避（各クエリは既存 index を素直に使う）。
export async function getEventDetail(db: Database, eventId: string) {
  const [meta, members, items, counters, modules] = await db.batch([
    db.select().from(event).where(eq(event.id, eventId)).limit(1),
    db.select().from(eventMember).where(eq(eventMember.eventId, eventId)),
    db
      .select()
      .from(scheduleItem)
      .where(eq(scheduleItem.eventId, eventId))
      .orderBy(scheduleItem.orderIndex),
    db
      .select()
      .from(attendanceCounter)
      .where(eq(attendanceCounter.eventId, eventId)),
    db
      .select()
      .from(eventModule)
      .where(eq(eventModule.eventId, eventId))
      .orderBy(eventModule.orderIndex),
  ]);
  if (!meta[0]) return null;
  return { event: meta[0], members, items, counters, modules };
}

// 一覧 = member 行を引いて event へ join（1 クエリ）。
export async function listEventsForUser(db: Database, userId: string) {
  return db
    .select({
      id: event.id,
      title: event.title,
      status: event.status,
      startsAtMs: event.startsAtMs,
      timezone: event.timezone,
      role: eventMember.role,
      updatedAt: event.updatedAt,
    })
    .from(eventMember)
    .innerJoin(event, eq(eventMember.eventId, event.id))
    .where(
      and(eq(eventMember.userId, userId), eq(eventMember.status, "active")),
    )
    .orderBy(desc(event.startsAtMs));
}

export async function patchEvent(
  db: Database,
  eventId: string,
  input: PatchEventInput,
) {
  const rows = await db
    .update(event)
    .set({ ...input, updatedAt: nowDate() })
    .where(eq(event.id, eventId))
    .returning();
  return rows[0] ?? null;
}

// 論理削除（status=archived）。
export async function archiveEvent(db: Database, eventId: string) {
  await db
    .update(event)
    .set({ status: "archived", updatedAt: nowDate() })
    .where(eq(event.id, eventId));
}
