import { describe, expect, it } from "vitest";
import { ServerClock } from "./clock";

describe("ServerClock", () => {
  it("sync 後の serverNow は serverNowMs + 経過分に近い（端末時計非依存）", () => {
    const c = new ServerClock();
    c.sync(1_000_000);
    const now = c.serverNow();
    // 同期直後なので serverNowMs にごく近い（performance.now 経過は数ms以内）
    expect(now).toBeGreaterThanOrEqual(1_000_000);
    expect(now).toBeLessThan(1_000_000 + 1_000);
  });

  it("未 sync では Date.now フォールバック", () => {
    const c = new ServerClock();
    const now = c.serverNow();
    expect(Math.abs(now - Date.now())).toBeLessThan(1_000);
  });
});
