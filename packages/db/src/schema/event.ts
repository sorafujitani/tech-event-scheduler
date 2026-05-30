import { EventStatusValues, MemberRoleValues, MemberStatusValues } from "@app/shared";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const event = sqliteTable(
  "event",
  {
    id: text("id").primaryKey(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    // 公開URL用。published 以降に必須（アプリ層で担保）。unique は下の
    // uniqueIndex(event_public_slug_uq) で付与（列の .unique() と二重化しない）
    publicSlug: text("public_slug"),
    // 参加者向け外部URL（任意）
    externalUrl: text("external_url"),
    // 開催予定(epoch ms, draft 時 null 可)
    startsAtMs: integer("starts_at_ms"),
    endsAtMs: integer("ends_at_ms"),
    // IANA tz, 表示用
    timezone: text("timezone").notNull().default("Asia/Tokyo"),
    status: text("status", { enum: EventStatusValues })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("event_public_slug_uq").on(t.publicSlug),
    index("event_created_by_idx").on(t.createdByUserId),
    index("event_status_starts_idx").on(t.status, t.startsAtMs),
  ],
);

export const eventMember = sqliteTable(
  "event_member",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    // 招待中は userId 未確定 → null 可
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email"),
    role: text("role", { enum: MemberRoleValues })
      .notNull()
      .default("manager"),
    status: text("status", { enum: MemberStatusValues })
      .notNull()
      .default("invited"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    invitedAt: integer("invited_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    // null 同士は衝突しない（招待中の重複は下の partial unique で防ぐ）
    uniqueIndex("event_member_event_user_uq").on(t.eventId, t.userId),
    // 同一イベントへの同一メール二重招待を防ぐ partial unique（Phase2 で有効化）
    uniqueIndex("event_member_event_invited_email_uq")
      .on(t.eventId, t.invitedEmail)
      .where(sql`${t.userId} IS NULL AND ${t.invitedEmail} IS NOT NULL`),
    // 「自分が管理するイベント一覧」
    index("event_member_user_idx").on(t.userId),
    // 詳細でメンバー列挙
    index("event_member_event_idx").on(t.eventId),
    // getMembership の active 絞り込み（eventId, userId, status）
    index("event_member_event_user_status_idx").on(
      t.eventId,
      t.userId,
      t.status,
    ),
  ],
);
