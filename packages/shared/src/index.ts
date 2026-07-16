import { Temporal } from "temporal-polyfill";
import { z } from "zod";

const dateToInstant = (d: Date): Temporal.Instant =>
  Temporal.Instant.fromEpochMilliseconds(d.getTime());

// ---------------------------------------------------------------------------
// ドメイン enum（単一ソース）。`@app/db` が text(name,{enum}) と zod 双方に食わせ、
// api/web/DO も同じ配列を参照する。shared は db/drizzle を import しない（循環回避）。
// ---------------------------------------------------------------------------

// 値配列は `as const` タプルで定義する。drizzle の text({enum}) は
// readonly [string, ...string[]] を要求するため、z.enum().options（配列型）では
// 渡せない。db/api/web/DO はこの *Values と z.enum の両方を用途に応じて参照する。

export const EventStatusValues = [
  "draft",
  "published",
  "live",
  "ended",
  "archived",
] as const;
export const EventStatus = z.enum(EventStatusValues);
export type EventStatus = z.infer<typeof EventStatus>;

export const MemberRoleValues = ["owner", "manager"] as const;
export const MemberRole = z.enum(MemberRoleValues);
export type MemberRole = z.infer<typeof MemberRole>;

export const MemberStatusValues = ["invited", "active", "revoked"] as const;
export const MemberStatus = z.enum(MemberStatusValues);
export type MemberStatus = z.infer<typeof MemberStatus>;

export const ScheduleItemKindValues = ["session", "break", "other"] as const;
export const ScheduleItemKind = z.enum(ScheduleItemKindValues);
export type ScheduleItemKind = z.infer<typeof ScheduleItemKind>;

export const ScheduleItemStatusValues = [
  "scheduled",
  "running",
  "paused",
  "done",
  "skipped",
] as const;
export const ScheduleItemStatus = z.enum(ScheduleItemStatusValues);
export type ScheduleItemStatus = z.infer<typeof ScheduleItemStatus>;

export const ModuleTypeValues = ["timetable", "attendance", "ost"] as const;
export const ModuleType = z.enum(ModuleTypeValues);
export type ModuleType = z.infer<typeof ModuleType>;

export const AttendanceEventKindValues = ["adjust", "reset"] as const;
export const AttendanceEventKind = z.enum(AttendanceEventKindValues);
export type AttendanceEventKind = z.infer<typeof AttendanceEventKind>;

// ---------------------------------------------------------------------------
// 統一エラー（M2 単一ソース）。BE errors/index.ts と FE api-error.ts が import。
// ---------------------------------------------------------------------------

export const ErrorCodeValues = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ErrorCodeValues)[number];
export interface ErrorBody {
  error: string;
  code: ErrorCode;
}

// ---------------------------------------------------------------------------
// シリアライザ（列名サフィックス規約の強制）。
// `*At`(Date) は ISO 文字列へ、`*_at_ms`(number) は素通し。route 出力境界で適用。
// ---------------------------------------------------------------------------

export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};

export function serializeRow<T extends Record<string, unknown>>(
  row: T,
): Serialized<T> {
  const out: Record<string, unknown> = {};
  for (const k in row) {
    const v = row[k];
    out[k] = v instanceof Date ? dateToInstant(v).toString() : v;
  }
  return out as Serialized<T>;
}

// ---------------------------------------------------------------------------
// タイマー（サーバー権威時刻で再構成可能な最小5列）。不変条件を discriminated
// union で型表現する。経過時間は常にサーバー由来の nowMs(epoch ms)で計算する。
// ---------------------------------------------------------------------------

export type TimerSnapshot =
  | {
      id: string;
      plannedDurationSec: number;
      status: "scheduled";
      actualStartedAtMs: null;
      accumulatedPauseMs: number;
      pausedAtMs: null;
      endedAtMs: null;
    }
  | {
      id: string;
      plannedDurationSec: number;
      status: "running";
      actualStartedAtMs: number;
      accumulatedPauseMs: number;
      pausedAtMs: null;
      endedAtMs: null;
    }
  | {
      id: string;
      plannedDurationSec: number;
      status: "paused";
      actualStartedAtMs: number;
      accumulatedPauseMs: number;
      pausedAtMs: number;
      endedAtMs: null;
    }
  | {
      id: string;
      plannedDurationSec: number;
      status: "done" | "skipped";
      actualStartedAtMs: number;
      accumulatedPauseMs: number;
      pausedAtMs: null;
      endedAtMs: number;
    };

/** 経過ミリ秒。負やジャンプを防ぐため max(0, …) でクランプする。 */
export function elapsedMs(s: TimerSnapshot, nowMs: number): number {
  switch (s.status) {
    case "scheduled":
      return 0;
    case "running":
      return Math.max(0, nowMs - s.actualStartedAtMs - s.accumulatedPauseMs);
    case "paused":
      return Math.max(
        0,
        s.pausedAtMs - s.actualStartedAtMs - s.accumulatedPauseMs,
      );
    case "done":
    case "skipped":
      return Math.max(
        0,
        s.endedAtMs - s.actualStartedAtMs - s.accumulatedPauseMs,
      );
  }
}

/** 残りミリ秒。負なら overrun（超過）。 */
export function remainingMs(s: TimerSnapshot, nowMs: number): number {
  return s.plannedDurationSec * 1000 - elapsedMs(s, nowMs);
}

/** 残りがこれを切ったら「まもなく終了」表示・通知に切り替える閾値。 */
export const TIMER_SOON_THRESHOLD_MS = 60_000;

// ---------------------------------------------------------------------------
// ライブ状態のスナップショット & WS wire 型（M3: counter は serverNowMs を持たない）。
// ModuleSnapshot は discriminated union にして exhaustive 描画を型で強制する。
// ---------------------------------------------------------------------------

export interface CounterDiff {
  counterId: string;
  value: number;
  seq: number;
}

export interface CounterSnapshot extends CounterDiff {
  capacity: number | null;
}

export type ModuleSnapshot =
  | { moduleType: "timetable"; data: { items: TimerSnapshot[] } }
  | { moduleType: "attendance"; data: { counters: CounterDiff[] } };

export interface FullSnapshot {
  version: number;
  serverNowMs: number;
  timers: TimerSnapshot[];
  counters: CounterSnapshot[];
  modules: ModuleSnapshot[];
  presence: { count: number };
}

export type LiveMessage =
  | {
      kind: "snapshot";
      version: number;
      serverNowMs: number;
      payload: FullSnapshot;
    }
  | {
      kind: "timer";
      version: number;
      serverNowMs: number;
      payload: TimerSnapshot;
    }
  | { kind: "counter"; version: number; payload: CounterDiff }
  | { kind: "schedule"; version: number; payload: { items: TimerSnapshot[] } }
  | { kind: "presence"; version: number; payload: { count: number } };

// ---------------------------------------------------------------------------
// WS 受信境界の zod スキーマ。型定義（上記）が単一ソースで、satisfies により
// スキーマと型のドリフトをコンパイル時に検出する。
// ---------------------------------------------------------------------------

const timerSnapshotSchema = z.discriminatedUnion("status", [
  z.object({
    id: z.string(),
    plannedDurationSec: z.number(),
    status: z.literal("scheduled"),
    actualStartedAtMs: z.null(),
    accumulatedPauseMs: z.number(),
    pausedAtMs: z.null(),
    endedAtMs: z.null(),
  }),
  z.object({
    id: z.string(),
    plannedDurationSec: z.number(),
    status: z.literal("running"),
    actualStartedAtMs: z.number(),
    accumulatedPauseMs: z.number(),
    pausedAtMs: z.null(),
    endedAtMs: z.null(),
  }),
  z.object({
    id: z.string(),
    plannedDurationSec: z.number(),
    status: z.literal("paused"),
    actualStartedAtMs: z.number(),
    accumulatedPauseMs: z.number(),
    pausedAtMs: z.number(),
    endedAtMs: z.null(),
  }),
  z.object({
    id: z.string(),
    plannedDurationSec: z.number(),
    status: z.enum(["done", "skipped"]),
    actualStartedAtMs: z.number(),
    accumulatedPauseMs: z.number(),
    pausedAtMs: z.null(),
    endedAtMs: z.number(),
  }),
]) satisfies z.ZodType<TimerSnapshot>;

const counterDiffSchema = z.object({
  counterId: z.string(),
  value: z.number(),
  seq: z.number(),
}) satisfies z.ZodType<CounterDiff>;

const counterSnapshotSchema = counterDiffSchema.extend({
  capacity: z.number().nullable(),
}) satisfies z.ZodType<CounterSnapshot>;

const moduleSnapshotSchema = z.discriminatedUnion("moduleType", [
  z.object({
    moduleType: z.literal("timetable"),
    data: z.object({ items: z.array(timerSnapshotSchema) }),
  }),
  z.object({
    moduleType: z.literal("attendance"),
    data: z.object({ counters: z.array(counterDiffSchema) }),
  }),
]) satisfies z.ZodType<ModuleSnapshot>;

const fullSnapshotSchema = z.object({
  version: z.number(),
  serverNowMs: z.number(),
  timers: z.array(timerSnapshotSchema),
  counters: z.array(counterSnapshotSchema),
  modules: z.array(moduleSnapshotSchema),
  presence: z.object({ count: z.number() }),
}) satisfies z.ZodType<FullSnapshot>;

export const LiveMessage = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("snapshot"),
    version: z.number(),
    serverNowMs: z.number(),
    payload: fullSnapshotSchema,
  }),
  z.object({
    kind: z.literal("timer"),
    version: z.number(),
    serverNowMs: z.number(),
    payload: timerSnapshotSchema,
  }),
  z.object({
    kind: z.literal("counter"),
    version: z.number(),
    payload: counterDiffSchema,
  }),
  z.object({
    kind: z.literal("schedule"),
    version: z.number(),
    payload: z.object({ items: z.array(timerSnapshotSchema) }),
  }),
  z.object({
    kind: z.literal("presence"),
    version: z.number(),
    payload: z.object({ count: z.number() }),
  }),
]) satisfies z.ZodType<LiveMessage>;
