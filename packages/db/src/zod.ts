import { createInsertSchema } from "drizzle-zod";
import { event } from "./schema/event";
import { scheduleItem } from "./schema/schedule";

// スキーマは drizzle テーブル定義から導出する（手書きの並行定義を作らない）。
// 必要になったテーブルの分だけここに追加する。
export const eventInsertSchema = createInsertSchema(event);
export const scheduleItemInsertSchema = createInsertSchema(scheduleItem);
