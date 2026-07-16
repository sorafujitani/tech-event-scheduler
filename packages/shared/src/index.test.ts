import { describe, expect, it } from "vitest";
import {
  elapsedMs,
  remainingMs,
  serializeRow,
  type TimerSnapshot,
} from "./index";

const base = { id: "t1", plannedDurationSec: 60 };

describe("elapsedMs", () => {
  it("scheduled は常に 0", () => {
    const s: TimerSnapshot = {
      ...base,
      status: "scheduled",
      actualStartedAtMs: null,
      accumulatedPauseMs: 0,
      pausedAtMs: null,
      endedAtMs: null,
    };
    expect(elapsedMs(s, 10_000)).toBe(0);
  });

  it("running は now - 開始 - 累積pause", () => {
    const s: TimerSnapshot = {
      ...base,
      status: "running",
      actualStartedAtMs: 1_000,
      accumulatedPauseMs: 500,
      pausedAtMs: null,
      endedAtMs: null,
    };
    // 11_000 - 1_000 - 500 = 9_500
    expect(elapsedMs(s, 11_000)).toBe(9_500);
  });

  it("paused は pausedAtMs を基準にし now に依存しない", () => {
    const s: TimerSnapshot = {
      ...base,
      status: "paused",
      actualStartedAtMs: 1_000,
      accumulatedPauseMs: 0,
      pausedAtMs: 6_000,
      endedAtMs: null,
    };
    // 6_000 - 1_000 - 0 = 5_000（now を変えても不変）
    expect(elapsedMs(s, 99_999)).toBe(5_000);
    expect(elapsedMs(s, 6_000)).toBe(5_000);
  });

  it("done/skipped は endedAtMs を基準にする", () => {
    const done: TimerSnapshot = {
      ...base,
      status: "done",
      actualStartedAtMs: 1_000,
      accumulatedPauseMs: 200,
      pausedAtMs: null,
      endedAtMs: 8_000,
    };
    // 8_000 - 1_000 - 200 = 6_800
    expect(elapsedMs(done, 50_000)).toBe(6_800);
  });

  it("不整合な負の経過は 0 にクランプされる", () => {
    const s: TimerSnapshot = {
      ...base,
      status: "running",
      actualStartedAtMs: 10_000,
      accumulatedPauseMs: 0,
      pausedAtMs: null,
      endedAtMs: null,
    };
    // now < 開始 でも負にならない
    expect(elapsedMs(s, 5_000)).toBe(0);
  });
});

describe("remainingMs", () => {
  const running: TimerSnapshot = {
    ...base,
    status: "running",
    actualStartedAtMs: 0,
    accumulatedPauseMs: 0,
    pausedAtMs: null,
    endedAtMs: null,
  };

  it("予定内は正の残り", () => {
    // 60s - 10s = 50s 残り
    expect(remainingMs(running, 10_000)).toBe(50_000);
  });

  it("予定超過は負の残り = overrun", () => {
    // 60s - 70s = -10s
    expect(remainingMs(running, 70_000)).toBe(-10_000);
  });
});

describe("serializeRow", () => {
  it("Date 列は ISO 文字列へ、*_at_ms(number) は素通し", () => {
    const row = {
      id: "e1",
      createdAt: new Date("2026-05-30T00:00:00.000Z"),
      startsAtMs: 1_700_000_000_000,
      title: "TechConf",
      deletedAt: null as Date | null,
    };
    const out = serializeRow(row);
    expect(out.createdAt).toBe("2026-05-30T00:00:00Z");
    expect(out.startsAtMs).toBe(1_700_000_000_000);
    expect(out.title).toBe("TechConf");
    expect(out.deletedAt).toBeNull();
  });
});
