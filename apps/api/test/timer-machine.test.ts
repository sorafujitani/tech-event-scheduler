import { remainingMs } from "@app/shared";
import { describe, expect, it } from "vitest";
import {
  complete,
  extend,
  IllegalTransition,
  pause,
  resume,
  type RoomTimer,
  skip,
  start,
} from "../src/durable/timer-machine";

const scheduled: RoomTimer = {
  id: "t1",
  plannedDurationSec: 60,
  status: "scheduled",
  actualStartedAtMs: null,
  accumulatedPauseMs: 0,
  pausedAtMs: null,
  endedAtMs: null,
  track: "main",
  overrunNotified: false,
};

describe("timer-machine 遷移", () => {
  it("start: scheduled→running", () => {
    const r = start(scheduled, 1000);
    expect(r.status).toBe("running");
    expect(r.actualStartedAtMs).toBe(1000);
  });

  it("二重 start は不正遷移", () => {
    const r = start(scheduled, 1000);
    expect(() => start(r, 2000)).toThrow(IllegalTransition);
  });

  it("pause→resume で accumulatedPauseMs が加算され pausedAtMs が null に戻る", () => {
    const r1 = start(scheduled, 1000); // running
    const r2 = pause(r1, 4000); // paused（経過3s）
    expect(r2.status).toBe("paused");
    expect(r2.pausedAtMs).toBe(4000);
    const r3 = resume(r2, 9000); // 5s 停止後 resume
    expect(r3.status).toBe("running");
    expect(r3.accumulatedPauseMs).toBe(5000);
    expect(r3.pausedAtMs).toBeNull();
    // 経過 = now - start - pause: 14000 - 1000 - 5000 = 8000 → 残り 52000
    expect(remainingMs(r3, 14000)).toBe(52000);
  });

  it("complete(paused) は pausedAtMs を endedAtMs に確定", () => {
    const r = complete(pause(start(scheduled, 1000), 4000), 9999);
    expect(r.status).toBe("done");
    expect(r.endedAtMs).toBe(4000);
  });

  it("skip は scheduled からでも final 化、final からは不正遷移", () => {
    const r = skip(scheduled, 5000);
    expect(r.status).toBe("skipped");
    expect(r.actualStartedAtMs).toBe(5000);
    expect(() => skip(r, 6000)).toThrow(IllegalTransition);
  });

  it("extend は plannedDurationSec を増やし overrunNotified をリセット、負は不正", () => {
    const running = { ...start(scheduled, 1000), overrunNotified: true };
    const r = extend(running, 30);
    expect(r.plannedDurationSec).toBe(90);
    expect(r.overrunNotified).toBe(false);
    expect(() => extend(running, -1000)).toThrow(IllegalTransition);
  });

  it("resume は paused 以外で不正", () => {
    expect(() => resume(scheduled, 1)).toThrow(IllegalTransition);
  });
});
