import { createDb, type Database } from "@app/db";
import { attendanceEvent, user } from "@app/db/schema";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { flushCounterWal, listCounters } from "../src/repo/counters";
import type { WalEntry } from "../src/durable/wal";
import * as eventsRepo from "../src/repo/events";
import { newId, nowDate, nowMs } from "../src/repo/ids";

const db: Database = createDb(env.DB);

beforeAll(async () => {
  const now = nowDate();
  await db.insert(user).values({
    id: "wal-user",
    name: "wal",
    email: "wal@test.dev",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
});

describe("flushCounterWal", () => {
  it("entry を attendance_event へ INSERT し counter を UPSERT、再 flush は冪等", async () => {
    const { eventId } = await eventsRepo.createEventWithOwner(db, "wal-user", {
      title: "WAL",
      timezone: "Asia/Tokyo",
    });
    const counterId = (await listCounters(db, eventId))[0]!.id;
    const k = "idem-key-12345678";
    const entry: WalEntry = {
      id: newId(),
      globalSeq: 1,
      counterId,
      kind: "adjust",
      delta: 3,
      seq: 1,
      valueAfter: 3,
      idempotencyKey: k,
      actedByUserId: "wal-user",
      actedAtMs: nowMs(),
    };

    await flushCounterWal(db, [entry], nowMs());
    let rows = await db
      .select()
      .from(attendanceEvent)
      .where(eq(attendanceEvent.counterId, counterId));
    expect(rows).toHaveLength(1);
    let counter = (await listCounters(db, eventId))[0]!;
    expect(counter.currentValue).toBe(3);
    expect(counter.lastSeq).toBe(1);

    // 再 flush（at-least-once 再送）→ unique で二重 INSERT されない
    await flushCounterWal(db, [{ ...entry, id: newId() }], nowMs());
    rows = await db
      .select()
      .from(attendanceEvent)
      .where(eq(attendanceEvent.counterId, counterId));
    expect(rows).toHaveLength(1);
    counter = (await listCounters(db, eventId))[0]!;
    expect(counter.lastSeq).toBe(1); // 巻き戻り無し（lastSeq < seq の条件で no-op）
  });
});
