import { ScheduleItemKindValues, ScheduleItemStatusValues } from "@app/shared";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { event } from "./event";

// 状態機械の不変条件（DB 制約では表現しきれない分は @app/shared の純関数 assert と
// DO の write-through で保証する。再構成の正しさはこの不変条件に依存する）:
//   running  : actualStartedAtMs != null, pausedAtMs == null
//   paused   : actualStartedAtMs != null, pausedAtMs != null,
//              accumulatedPauseMs は「当該 pause を含まない」（resume 時に確定加算）
//   done/skip: endedAtMs != null
export const scheduleItem = sqliteTable(
  "schedule_item",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ScheduleItemKindValues })
      .notNull()
      .default("session"),
    // 並行トラックへの将来拡張。MVP は "main" 単一
    track: text("track").notNull().default("main"),
    title: text("title").notNull(),
    speaker: text("speaker"),
    note: text("note"),
    // 1000, 2000… で採番、挿入容易
    orderIndex: integer("order_index").notNull(),
    // タイムテーブル上の予定(任意)
    plannedStartAtMs: integer("planned_start_at_ms"),
    plannedDurationSec: integer("planned_duration_sec").notNull(),
    // --- 状態機械（サーバー権威時刻で再構成可能な最小列）---
    status: text("status", { enum: ScheduleItemStatusValues })
      .notNull()
      .default("scheduled"),
    // 最初に running した瞬間(epoch ms)
    actualStartedAtMs: integer("actual_started_at_ms"),
    accumulatedPauseMs: integer("accumulated_pause_ms").notNull().default(0),
    // 現在 paused なら開始時刻、それ以外 null
    pausedAtMs: integer("paused_at_ms"),
    // done/skip 確定時刻
    endedAtMs: integer("ended_at_ms"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("schedule_item_event_order_idx").on(t.eventId, t.orderIndex),
    index("schedule_item_event_status_idx").on(t.eventId, t.status),
  ],
);
