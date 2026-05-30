import type { TimerSnapshot } from "@app/shared";

/** 不正な状態遷移。DO が CONFLICT に変換する。 */
export class IllegalTransition extends Error {
  constructor(public override readonly cause: string) {
    super(cause);
    this.name = "IllegalTransition";
  }
}

/** DO がメモリ/ storage に保持するタイマー。wire の TimerSnapshot にトラックと overrun 通知済みフラグを付加。 */
export type RoomTimer = TimerSnapshot & {
  track: string;
  overrunNotified: boolean;
};

export function start(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status !== "scheduled")
    throw new IllegalTransition("timer_not_scheduled");
  return {
    ...t,
    status: "running",
    actualStartedAtMs: nowMs,
    accumulatedPauseMs: 0,
    pausedAtMs: null,
    endedAtMs: null,
  };
}

export function pause(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status !== "running") throw new IllegalTransition("timer_not_running");
  return { ...t, status: "paused", pausedAtMs: nowMs };
}

export function resume(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status !== "paused") throw new IllegalTransition("timer_not_paused");
  return {
    ...t,
    status: "running",
    accumulatedPauseMs: t.accumulatedPauseMs + (nowMs - t.pausedAtMs),
    pausedAtMs: null,
  };
}

export function complete(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status !== "running" && t.status !== "paused")
    throw new IllegalTransition("timer_not_active");
  const endedAtMs = t.status === "paused" ? t.pausedAtMs : nowMs;
  return { ...t, status: "done", pausedAtMs: null, endedAtMs };
}

export function skip(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status === "done" || t.status === "skipped")
    throw new IllegalTransition("timer_already_final");
  // scheduled からの skip も許す（actualStartedAtMs を確定させる）
  const actualStartedAtMs = t.actualStartedAtMs ?? nowMs;
  return {
    ...t,
    status: "skipped",
    actualStartedAtMs,
    pausedAtMs: null,
    endedAtMs: nowMs,
  };
}

export function extend(t: RoomTimer, deltaSec: number): RoomTimer {
  if (t.status === "done" || t.status === "skipped")
    throw new IllegalTransition("timer_already_final");
  const next = t.plannedDurationSec + deltaSec;
  if (next < 0) throw new IllegalTransition("duration_negative");
  return { ...t, plannedDurationSec: next, overrunNotified: false };
}
