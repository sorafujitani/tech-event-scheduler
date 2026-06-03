import { describe, expect, it } from "vitest";
import { formatTimerDisplayMs } from "./timer-labels";

describe("formatTimerDisplayMs", () => {
  it("停止中でも超過分は + 表記を維持する", () => {
    expect(formatTimerDisplayMs("paused", -90_000, 60)).toBe("+1:30");
  });

  it("停止中の予定内は残りをそのまま表示する", () => {
    expect(formatTimerDisplayMs("paused", 45_000, 60)).toBe("0:45");
  });

  it("開始前は予定時間を表示する", () => {
    expect(formatTimerDisplayMs("scheduled", 60_000, 600)).toBe("10:00");
  });
});
