import type { FullSnapshot, TimerSnapshot } from "@app/shared";
import { describe, expect, it, vi } from "vitest";
import { LiveStore } from "./store";

const timer = (id: string, status: TimerSnapshot["status"] = "scheduled"): TimerSnapshot =>
  status === "running"
    ? {
        id,
        plannedDurationSec: 60,
        status: "running",
        actualStartedAtMs: 1000,
        accumulatedPauseMs: 0,
        pausedAtMs: null,
        endedAtMs: null,
      }
    : {
        id,
        plannedDurationSec: 60,
        status: "scheduled",
        actualStartedAtMs: null,
        accumulatedPauseMs: 0,
        pausedAtMs: null,
        endedAtMs: null,
      };

const snapshot = (version: number): FullSnapshot => ({
  version,
  serverNowMs: 10_000,
  timers: [timer("t1"), timer("t2")],
  counters: [{ counterId: "c1", value: 0, seq: 0, capacity: 100 }],
  modules: [],
  presence: { count: 1 },
});

describe("LiveStore version 順適用", () => {
  it("version+1 の timer 差分を適用し version を進める", () => {
    const s = new LiveStore(snapshot(5));
    s.applyMessage({
      kind: "timer",
      version: 6,
      serverNowMs: 11_000,
      payload: timer("t1", "running"),
    });
    expect(s.getVersion()).toBe(6);
    expect(s.getTimer("t1")?.status).toBe("running");
  });

  it("version <= cur は冪等無視", () => {
    const s = new LiveStore(snapshot(5));
    s.applyMessage({
      kind: "counter",
      version: 5,
      payload: { counterId: "c1", value: 99, seq: 9 },
    });
    expect(s.getCounter("c1")?.value).toBe(0);
  });

  it("ギャップ(version>cur+1)は差分破棄して resync 要求", () => {
    const s = new LiveStore(snapshot(5));
    const onResync = vi.fn();
    s.onResyncNeeded = onResync;
    s.applyMessage({
      kind: "counter",
      version: 8,
      payload: { counterId: "c1", value: 3, seq: 3 },
    });
    expect(onResync).toHaveBeenCalledWith("gap");
    expect(s.getCounter("c1")?.value).toBe(0); // 差分は適用されない
    expect(s.getVersion()).toBe(5);
  });

  it("snapshot は version を権威として全置換", () => {
    const s = new LiveStore(snapshot(5));
    s.applySnapshot(snapshot(20));
    expect(s.getVersion()).toBe(20);
  });

  it("counter の seq 後退は無視（順序保証の二重防壁）", () => {
    const s = new LiveStore(snapshot(5));
    s.applyMessage({
      kind: "counter",
      version: 6,
      payload: { counterId: "c1", value: 5, seq: 5 },
    });
    expect(s.getCounter("c1")?.value).toBe(5);
    // 古い seq の差分（version は +1 だが seq 後退）
    s.applyMessage({
      kind: "counter",
      version: 7,
      payload: { counterId: "c1", value: 99, seq: 3 },
    });
    expect(s.getCounter("c1")?.value).toBe(5); // 後退無視
    expect(s.getVersion()).toBe(7); // version は進む
  });
});

describe("LiveStore 購読粒度", () => {
  it("timer 更新は当該 timer listener のみ通知、無関係 counter listener は通知しない", () => {
    const s = new LiveStore(snapshot(5));
    const t1 = vi.fn();
    const c1 = vi.fn();
    s.subscribeTimer("t1", t1);
    s.subscribeCounter("c1", c1);
    s.applyMessage({
      kind: "timer",
      version: 6,
      serverNowMs: 11_000,
      payload: timer("t1", "running"),
    });
    expect(t1).toHaveBeenCalled();
    expect(c1).not.toHaveBeenCalled();
  });
});

describe("LiveStore applyConfirmedCounter", () => {
  it("POST 応答で確定値を反映（version 非干渉・seq ガード）", () => {
    const s = new LiveStore(snapshot(5));
    s.applyConfirmedCounter("c1", 3, 1);
    expect(s.getCounter("c1")?.value).toBe(3);
    expect(s.getVersion()).toBe(5); // version は触らない
    s.applyConfirmedCounter("c1", 99, 0); // 古い seq は無視
    expect(s.getCounter("c1")?.value).toBe(3);
  });
});
