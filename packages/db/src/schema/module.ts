import { ModuleTypeValues } from "@app/shared";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { event } from "./event";

export const eventModule = sqliteTable(
  "event_module",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    moduleType: text("module_type", { enum: ModuleTypeValues }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    orderIndex: integer("order_index").notNull().default(0),
    // 軽量設定のみ。実データは各モジュール専用テーブルへ
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("event_module_uq").on(t.eventId, t.moduleType),
    index("event_module_event_idx").on(t.eventId),
  ],
);
