import type { Database } from "@app/db";
import { attendanceCounter, attendanceEvent } from "@app/db/schema";
import { eq, sql } from "drizzle-orm";
import { lastPerCounter, type WalEntry } from "../durable/wal";

export async function listCounters(db: Database, eventId: string) {
  return db
    .select()
    .from(attendanceCounter)
    .where(eq(attendanceCounter.eventId, eventId));
}

/**
 * WAL を D1 へ flush（DO の alarm から呼ぶ）。
 * batch は全成功/全失敗。attendance_event の (counterId, idempotencyKey) unique で
 * 再送二重 INSERT を弾く（onConflictDoNothing）。counter は lastSeq < seq の時のみ UPSERT（巻き戻り防止）。
 */
export async function flushCounterWal(
  db: Database,
  entries: WalEntry[],
  nowMs: number,
): Promise<void> {
  if (entries.length === 0) return;
  const createdAt = new Date(nowMs);
  const stmts = [
    db
      .insert(attendanceEvent)
      .values(
        entries.map((e) => ({
          id: e.id,
          counterId: e.counterId,
          kind: e.kind,
          delta: e.delta,
          seq: e.seq,
          valueAfter: e.valueAfter,
          idempotencyKey: e.idempotencyKey,
          actedByUserId: e.actedByUserId,
          actedAtMs: e.actedAtMs,
          createdAt,
        })),
      )
      .onConflictDoNothing({
        target: [attendanceEvent.counterId, attendanceEvent.idempotencyKey],
      }),
    ...lastPerCounter(entries).map((e) =>
      db
        .update(attendanceCounter)
        .set({ currentValue: e.valueAfter, lastSeq: e.seq, updatedAt: createdAt })
        .where(
          sql`${attendanceCounter.id} = ${e.counterId} AND ${attendanceCounter.lastSeq} < ${e.seq}`,
        ),
    ),
  ];
  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
}
