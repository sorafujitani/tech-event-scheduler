import type { Database } from "@app/db";
import { scheduleItem } from "@app/db/schema";
import type { ScheduleItemStatus } from "@app/shared";
import { eq, sql } from "drizzle-orm";
import type {
  CreateScheduleItemInput,
  PatchScheduleItemInput,
} from "../schemas/schedule";
import { newId, nowDate } from "./ids";

/** DO のタイマー write-through。5 列 + status を 1 行 UPDATE（*_at_ms は number 素通し）。 */
export interface TimerTransitionFields {
  status: ScheduleItemStatus;
  actualStartedAtMs: number | null;
  accumulatedPauseMs: number;
  pausedAtMs: number | null;
  endedAtMs: number | null;
  plannedDurationSec: number;
}

export async function applyTimerTransition(
  db: Database,
  itemId: string,
  f: TimerTransitionFields,
): Promise<void> {
  await db
    .update(scheduleItem)
    .set({
      status: f.status,
      actualStartedAtMs: f.actualStartedAtMs,
      accumulatedPauseMs: f.accumulatedPauseMs,
      pausedAtMs: f.pausedAtMs,
      endedAtMs: f.endedAtMs,
      plannedDurationSec: f.plannedDurationSec,
      updatedAt: nowDate(),
    })
    .where(eq(scheduleItem.id, itemId));
}

export async function getItem(db: Database, itemId: string) {
  const rows = await db
    .select()
    .from(scheduleItem)
    .where(eq(scheduleItem.id, itemId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listItems(db: Database, eventId: string) {
  return db
    .select()
    .from(scheduleItem)
    .where(eq(scheduleItem.eventId, eventId))
    .orderBy(scheduleItem.orderIndex);
}

export async function createItem(
  db: Database,
  eventId: string,
  input: CreateScheduleItemInput,
) {
  const now = nowDate();
  // orderIndex 未指定なら末尾(+1000)に採番。1000刻みで後の挿入を容易にする。
  let orderIndex = input.orderIndex;
  if (orderIndex == null) {
    const rows = await db
      .select({
        max: sql<number>`coalesce(max(${scheduleItem.orderIndex}), 0)`,
      })
      .from(scheduleItem)
      .where(eq(scheduleItem.eventId, eventId));
    orderIndex = Number(rows[0]?.max ?? 0) + 1000;
  }
  const result = await db
    .insert(scheduleItem)
    .values({
      id: newId(),
      eventId,
      kind: input.kind ?? "session",
      track: input.track ?? "main",
      title: input.title,
      speaker: input.speaker ?? null,
      note: input.note ?? null,
      orderIndex,
      plannedStartAtMs: input.plannedStartAtMs ?? null,
      plannedDurationSec: input.plannedDurationSec,
      status: "scheduled",
      accumulatedPauseMs: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  // insert は必ず 1 行返す
  return result[0]!;
}

export async function patchItem(
  db: Database,
  itemId: string,
  input: PatchScheduleItemInput,
) {
  const rows = await db
    .update(scheduleItem)
    .set({ ...input, updatedAt: nowDate() })
    .where(eq(scheduleItem.id, itemId))
    .returning();
  return rows[0] ?? null;
}

export async function deleteItem(db: Database, itemId: string) {
  // Phase2: running 中は DO 判定で 409（callRoom 経由）にする。MVP CRUD は直接削除。
  await db.delete(scheduleItem).where(eq(scheduleItem.id, itemId));
}

export async function reorder(
  db: Database,
  eventId: string,
  orderedItemIds: string[],
) {
  const now = nowDate();
  const stmts = orderedItemIds.map((id, i) =>
    db
      .update(scheduleItem)
      .set({ orderIndex: (i + 1) * 1000, updatedAt: now })
      .where(
        sql`${scheduleItem.id} = ${id} AND ${scheduleItem.eventId} = ${eventId}`,
      ),
  );
  // reorderSchema が min(1) を保証するため非空。db.batch はタプル型を要求するのでキャスト。
  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
  return listItems(db, eventId);
}
