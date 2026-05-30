import { describe, expect, it } from "vitest";
import {
  applyAdjust,
  applyReset,
  type CounterState,
} from "../src/durable/counter-core";
import { counterMessage, snapshotMessage } from "../src/durable/snapshot";
import type { RoomTimer } from "../src/durable/timer-machine";

const c: CounterState = { value: 5, seq: 3, capacity: null, name: "main" };

describe("counter-core", () => {
  it("adjust は seq を進め下限0でクランプ", () => {
    const up = applyAdjust(c, +10);
    expect(up.next.value).toBe(15);
    expect(up.next.seq).toBe(4);
    expect(up.valueAfter).toBe(15);
    const down = applyAdjust(c, -100);
    expect(down.next.value).toBe(0); // クランプ
  });

  it("reset は prev を読みつつ value=0・seq++", () => {
    const r = applyReset(c);
    expect(r.prev).toBe(5);
    expect(r.next.value).toBe(0);
    expect(r.next.seq).toBe(4);
  });
});

describe("snapshot wire 型", () => {
  it("counter メッセージは serverNowMs を含まない（M3）", () => {
    const msg = counterMessage(7, c, "cnt1");
    expect(msg.kind).toBe("counter");
    expect("serverNowMs" in msg).toBe(false);
    if (msg.kind === "counter") {
      expect(msg.payload).toEqual({ counterId: "cnt1", value: 5, seq: 3 });
    }
  });

  it("snapshot は timetable/attendance モジュールと presence を含む", () => {
    const timer: RoomTimer = {
      id: "t1",
      plannedDurationSec: 60,
      status: "running",
      actualStartedAtMs: 1000,
      accumulatedPauseMs: 0,
      pausedAtMs: null,
      endedAtMs: null,
      track: "main",
      overrunNotified: false,
    };
    const msg = snapshotMessage(
      {
        version: 9,
        timers: [timer],
        counters: [{ id: "cnt1", state: c }],
        presenceCount: 2,
      },
      50_000,
    );
    expect(msg.kind).toBe("snapshot");
    if (msg.kind === "snapshot") {
      expect(msg.version).toBe(9);
      expect(msg.serverNowMs).toBe(50_000);
      expect(msg.payload.timers).toHaveLength(1);
      // wire の TimerSnapshot は track/overrunNotified を含まない
      expect("track" in msg.payload.timers[0]!).toBe(false);
      expect(msg.payload.modules.map((m) => m.moduleType)).toEqual([
        "timetable",
        "attendance",
      ]);
      expect(msg.payload.presence.count).toBe(2);
      expect(msg.payload.counters[0]!.capacity).toBeNull();
    }
  });
});
