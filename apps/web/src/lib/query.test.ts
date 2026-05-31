import { describe, expect, it } from "vitest";
import { qk } from "./query";

describe("queryKey 規約", () => {
  it("階層が一貫している（無効化の包含関係）", () => {
    expect(qk.events()).toEqual(["events"]);
    expect(qk.event("e1")).toEqual(["events", "e1"]);
    expect(qk.eventLive("e1")).toEqual(["events", "e1", "live"]);
    expect(qk.members("e1")).toEqual(["events", "e1", "members"]);
    expect(qk.counters("e1")).toEqual(["events", "e1", "counters"]);
    // event のプレフィックスが live/members/counters を包含する
    expect(qk.eventLive("e1").slice(0, 2)).toEqual(qk.event("e1"));
  });
});
