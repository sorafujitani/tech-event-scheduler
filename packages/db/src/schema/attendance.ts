import { AttendanceEventKindValues } from "@app/shared";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { event } from "./event";

export const attendanceCounter = sqliteTable(
  "attendance_counter",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    // 入口名(複数ゲート対応)
    name: text("name").notNull().default("main"),
    // 定員(任意)。超過はブロックせず警告
    capacity: integer("capacity"),
    // DO 権威の flush 値
    currentValue: integer("current_value").notNull().default(0),
    // DO が単調増加させる順序保証用
    lastSeq: integer("last_seq").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("attendance_counter_event_idx").on(t.eventId)],
);

// 追記専用ログ(監査 + 再構成)
export const attendanceEvent = sqliteTable(
  "attendance_event",
  {
    id: text("id").primaryKey(),
    counterId: text("counter_id")
      .notNull()
      .references(() => attendanceCounter.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: AttendanceEventKindValues })
      .notNull()
      .default("adjust"),
    // adjust: +1/-1/+N、reset: -(直前 value)
    delta: integer("delta").notNull(),
    // DO 採番。順序と lost-update 不在を保証
    seq: integer("seq").notNull(),
    valueAfter: integer("value_after").notNull(),
    // hibernation/再起動を跨いでも二重計上しないための冪等キー（DO が flush 時に永続化）
    idempotencyKey: text("idempotency_key").notNull(),
    actedByUserId: text("acted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // DO のサーバー権威時刻(epoch ms)
    actedAtMs: integer("acted_at_ms").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("attendance_event_counter_seq_idx").on(t.counterId, t.seq),
    // 二重計上防止の最終防壁（DO メモリの直近 N キー判定が揮発しても D1 が弾く）
    uniqueIndex("attendance_event_counter_idem_uq").on(
      t.counterId,
      t.idempotencyKey,
    ),
  ],
);
