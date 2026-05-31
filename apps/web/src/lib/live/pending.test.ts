import { describe, expect, it } from "vitest";
import { PendingQueue } from "./pending";

describe("PendingQueue カウンタ overlay", () => {
  it("楽観 delta を積み、optimisticValue に反映", () => {
    const p = new PendingQueue();
    p.applyOptimisticCounter("c1", 1);
    p.applyOptimisticCounter("c1", 1);
    expect(p.getOverlay("c1")).toBe(2);
    expect(p.optimisticValue("c1", 10)).toBe(12);
  });

  it("settle は overlay を相殺（確定値は別途 store 反映）", () => {
    const p = new PendingQueue();
    const op = p.applyOptimisticCounter("c1", 5);
    expect(p.getOverlay("c1")).toBe(5);
    p.settle(op);
    expect(p.getOverlay("c1")).toBe(0);
  });

  it("rollback も overlay を相殺", () => {
    const p = new PendingQueue();
    const op = p.applyOptimisticCounter("c1", -3);
    expect(p.optimisticValue("c1", 10)).toBe(7);
    p.rollback(op);
    expect(p.optimisticValue("c1", 10)).toBe(10);
  });

  it("下限 0 にクランプ", () => {
    const p = new PendingQueue();
    p.applyOptimisticCounter("c1", -100);
    expect(p.optimisticValue("c1", 3)).toBe(0);
  });
});
