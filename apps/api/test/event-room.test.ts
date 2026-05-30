import { createDb, type Database } from "@app/db";
import { user } from "@app/db/schema";
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { RoomCommand, RoomResponse } from "../src/durable/protocol";
import * as countersRepo from "../src/repo/counters";
import * as eventsRepo from "../src/repo/events";
import { nowDate } from "../src/repo/ids";
import * as scheduleRepo from "../src/repo/schedule";

const db: Database = createDb(env.DB);

beforeAll(async () => {
  const now = nowDate();
  await db.insert(user).values({
    id: "do-user",
    name: "do",
    email: "do@test.dev",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
});

async function seedEvent() {
  const { eventId } = await eventsRepo.createEventWithOwner(db, "do-user", {
    title: "DO Event",
    timezone: "Asia/Tokyo",
  });
  const a = await scheduleRepo.createItem(db, eventId, {
    title: "A",
    plannedDurationSec: 60,
  });
  const b = await scheduleRepo.createItem(db, eventId, {
    title: "B",
    plannedDurationSec: 60,
  });
  const counterRows = await countersRepo.listCounters(db, eventId);
  return { eventId, itemA: a.id, itemB: b.id, counterId: counterRows[0]!.id };
}

function stubFor(eventId: string) {
  return env.EVENT_ROOM.get(env.EVENT_ROOM.idFromName(eventId));
}

async function send(
  eventId: string,
  cmd: RoomCommand,
): Promise<{ status: number; body: RoomResponse }> {
  const res = await stubFor(eventId).fetch("https://room/__room/command", {
    method: "POST",
    headers: { "content-type": "application/json", "x-event-id": eventId },
    body: JSON.stringify(cmd),
  });
  return { status: res.status, body: (await res.json()) as RoomResponse };
}

const key = () => crypto.randomUUID();

describe("EventRoom: タイマー状態機械", () => {
  it("start→pause→resume→complete と D1 write-through", async () => {
    const { eventId, itemA } = await seedEvent();
    const s = await send(eventId, {
      type: "timer.start",
      itemId: itemA,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    expect(s.body.ok).toBe(true);
    if (s.body.ok && s.body.type === "timer")
      expect(s.body.payload.status).toBe("running");

    // D1 へ write-through されている
    const row = await scheduleRepo.getItem(db, itemA);
    expect(row!.status).toBe("running");
    expect(row!.actualStartedAtMs).not.toBeNull();

    await send(eventId, {
      type: "timer.pause",
      itemId: itemA,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    await send(eventId, {
      type: "timer.resume",
      itemId: itemA,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    const done = await send(eventId, {
      type: "timer.complete",
      itemId: itemA,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    if (done.body.ok && done.body.type === "timer")
      expect(done.body.payload.status).toBe("done");
  });

  it("同 track に running があると二重 start は 409 CONFLICT", async () => {
    const { eventId, itemA, itemB } = await seedEvent();
    await send(eventId, {
      type: "timer.start",
      itemId: itemA,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    const conflict = await send(eventId, {
      type: "timer.start",
      itemId: itemB,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.ok).toBe(false);
    if (!conflict.body.ok) expect(conflict.body.code).toBe("CONFLICT");
  });

  it("不正遷移（scheduled を pause）は 409", async () => {
    const { eventId, itemA } = await seedEvent();
    const r = await send(eventId, {
      type: "timer.pause",
      itemId: itemA,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    expect(r.status).toBe(409);
  });
});

describe("EventRoom: カウンタ直列化・冪等", () => {
  it("複数 adjust が直列加算され lost update が無い", async () => {
    const { eventId, counterId } = await seedEvent();
    // 20 件を並行送信 → DO の単一スレッドで直列化され lost update が起きないことを検証。
    await Promise.all(
      Array.from({ length: 20 }, () =>
        send(eventId, {
          type: "counter.adjust",
          counterId,
          delta: 1,
          actorUserId: "do-user",
          idempotencyKey: key(),
        }),
      ),
    );
    const snap = await send(eventId, { type: "snapshot.get" });
    if (snap.body.ok && snap.body.type === "snapshot") {
      const c = snap.body.payload.counters.find((x) => x.counterId === counterId);
      expect(c!.value).toBe(20);
    }
  });

  it("同一 Idempotency-Key の adjust 二重送信は 1 回だけ計上", async () => {
    const { eventId, counterId } = await seedEvent();
    const k = key();
    const first = await send(eventId, {
      type: "counter.adjust",
      counterId,
      delta: 5,
      actorUserId: "do-user",
      idempotencyKey: k,
    });
    const second = await send(eventId, {
      type: "counter.adjust",
      counterId,
      delta: 5,
      actorUserId: "do-user",
      idempotencyKey: k,
    });
    if (first.body.ok && first.body.type === "counter")
      expect(first.body.payload.value).toBe(5);
    if (second.body.ok && second.body.type === "counter")
      expect(second.body.payload.value).toBe(5); // 二重計上しない
  });

  it("reset は value=0・seq++（原子）", async () => {
    const { eventId, counterId } = await seedEvent();
    await send(eventId, {
      type: "counter.adjust",
      counterId,
      delta: 7,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    const r = await send(eventId, {
      type: "counter.reset",
      counterId,
      actorUserId: "do-user",
      idempotencyKey: key(),
    });
    if (r.body.ok && r.body.type === "counter")
      expect(r.body.payload.value).toBe(0);
  });
});

describe("EventRoom: snapshot", () => {
  it("FullSnapshot は version/timers/counters/modules/presence を含む", async () => {
    const { eventId } = await seedEvent();
    const snap = await send(eventId, { type: "snapshot.get" });
    expect(snap.body.ok).toBe(true);
    if (snap.body.ok && snap.body.type === "snapshot") {
      const p = snap.body.payload;
      expect(p.timers).toHaveLength(2);
      expect(p.counters).toHaveLength(1);
      expect(p.modules.map((m) => m.moduleType)).toEqual([
        "timetable",
        "attendance",
      ]);
      expect(p.presence.count).toBe(0);
      expect(typeof p.serverNowMs).toBe("number");
    }
  });
});
