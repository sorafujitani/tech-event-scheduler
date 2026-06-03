export type TimerUiStatus = "scheduled" | "running" | "paused" | "overrun";

export const TIMER_STATUS_META: Record<
  TimerUiStatus,
  { label: string; colorScheme: "gray" | "green" | "orange" | "red" }
> = {
  scheduled: {
    label: "開始前",
    colorScheme: "gray",
  },
  running: {
    label: "進行中",
    colorScheme: "green",
  },
  paused: {
    label: "一時停止中",
    colorScheme: "orange",
  },
  overrun: {
    label: "予定超過",
    colorScheme: "red",
  },
};

/** 表示用の残り/超過 ms（一時停止中の超過も + 表記を維持）。 */
export function formatTimerDisplayMs(
  uiStatus: TimerUiStatus,
  remaining: number,
  plannedDurationSec: number,
): string {
  if (uiStatus === "scheduled") return fmtDurationSec(plannedDurationSec);
  if (uiStatus === "overrun" || (uiStatus === "paused" && remaining < 0)) {
    return `+${fmtDurationMs(-remaining)}`;
  }
  return fmtDurationMs(Math.max(0, remaining));
}

export function fmtDurationMs(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtDurationSec(sec: number): string {
  return fmtDurationMs(sec * 1000);
}
