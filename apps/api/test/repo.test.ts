import { createDb, type Database } from "@app/db";
import { user } from "@app/db/schema";
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import * as eventsRepo from "../src/repo/events";
import { nowDate } from "../src/repo/ids";
import * as membersRepo from "../src/repo/members";
import * as scheduleRepo from "../src/repo/schedule";

const db: Database = createDb(env.DB);

async function seedUser(id: string) {
  const now = nowDate();
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@test.dev`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
}

// FK 用に十分なユーザーを確保
beforeAll(async () => {
  await Promise.all(["uA", "uB", "uC"].map(seedUser));
});

describe("createEventWithOwner", () => {
  it("event + owner member + 既定モジュール2 + 既定 counter を原子生成", async () => {
    const { eventId } = await eventsRepo.createEventWithOwner(db, "uA", {
      title: "TechConf",
      timezone: "Asia/Tokyo",
    });
    const detail = await eventsRepo.getEventDetail(db, eventId);
    expect(detail).not.toBeNull();
    expect(detail!.event.title).toBe("TechConf");
    expect(detail!.members).toHaveLength(1);
    expect(detail!.members[0]!.role).toBe("owner");
    expect(detail!.members[0]!.status).toBe("active");
    expect(new Set(detail!.modules.map((m) => m.moduleType))).toEqual(
      new Set(["attendance", "timetable"]),
    );
    expect(detail!.counters).toHaveLength(1);
    expect(detail!.counters[0]!.name).toBe("main");
  });
});

describe("getMembership（active 絞り込み）", () => {
  it("owner は引け、非メンバーは null", async () => {
    const { eventId } = await eventsRepo.createEventWithOwner(db, "uA", {
      title: "E",
      timezone: "Asia/Tokyo",
    });
    const owner = await membersRepo.getMembership(db, eventId, "uA");
    expect(owner?.role).toBe("owner");
    const none = await membersRepo.getMembership(db, eventId, "uB");
    expect(none).toBeNull();
  });
});

describe("listEventsForUser", () => {
  it("自分が active member のイベントを返す", async () => {
    const { eventId } = await eventsRepo.createEventWithOwner(db, "uB", {
      title: "Mine",
      timezone: "Asia/Tokyo",
    });
    const list = await eventsRepo.listEventsForUser(db, "uB");
    expect(list.some((e) => e.id === eventId && e.role === "owner")).toBe(true);
  });
});

describe("owner 不変条件（原子 SQL）", () => {
  it("最後の owner は削除できない／2人目を足せば削除可", async () => {
    const { eventId } = await eventsRepo.createEventWithOwner(db, "uA", {
      title: "Owners",
      timezone: "Asia/Tokyo",
    });
    // 単独 owner は削除拒否
    expect(await membersRepo.deleteMemberAtomic(db, eventId, "uA")).toBe(false);
    // 2人目の owner を追加 → 片方は削除可
    await membersRepo.addMember(db, eventId, "uB", "owner", "uA");
    expect(await membersRepo.deleteMemberAtomic(db, eventId, "uA")).toBe(true);
    // 残った uB が単独 owner → 削除拒否
    expect(await membersRepo.deleteMemberAtomic(db, eventId, "uB")).toBe(false);
  });

  it("最後の owner は降格できない／2人いれば降格可", async () => {
    const { eventId } = await eventsRepo.createEventWithOwner(db, "uA", {
      title: "Demote",
      timezone: "Asia/Tokyo",
    });
    expect(await membersRepo.demoteOwnerAtomic(db, eventId, "uA")).toBe(false);
    await membersRepo.addMember(db, eventId, "uC", "owner", "uA");
    expect(await membersRepo.demoteOwnerAtomic(db, eventId, "uA")).toBe(true);
  });
});

describe("addMember upsert", () => {
  it("同一ユーザー再アサインは1行を更新（重複しない）", async () => {
    const { eventId } = await eventsRepo.createEventWithOwner(db, "uA", {
      title: "Upsert",
      timezone: "Asia/Tokyo",
    });
    await membersRepo.addMember(db, eventId, "uB", "manager", "uA");
    await membersRepo.addMember(db, eventId, "uB", "owner", "uA");
    const members = await membersRepo.listMembers(db, eventId);
    const uB = members.filter((m) => m.userId === "uB");
    expect(uB).toHaveLength(1);
    expect(uB[0]!.role).toBe("owner");
  });
});

describe("schedule items", () => {
  it("orderIndex 未指定は末尾採番、reorder で並び替え", async () => {
    const { eventId } = await eventsRepo.createEventWithOwner(db, "uA", {
      title: "Sched",
      timezone: "Asia/Tokyo",
    });
    const a = await scheduleRepo.createItem(db, eventId, {
      title: "A",
      plannedDurationSec: 600,
    });
    const b = await scheduleRepo.createItem(db, eventId, {
      title: "B",
      plannedDurationSec: 300,
    });
    expect(a.orderIndex).toBe(1000);
    expect(b.orderIndex).toBe(2000);

    const reordered = await scheduleRepo.reorder(db, eventId, [b.id, a.id]);
    expect(reordered.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(reordered[0]!.orderIndex).toBeLessThan(reordered[1]!.orderIndex);
  });
});
