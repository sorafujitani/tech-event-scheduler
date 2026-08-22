# tech-event-scheduler 設計書 — 当日運営ツール（最終版 / レビュー反映済み）

イベント管理者がスマホからイベントの当日実行管理（入場カウンタ・タイマー進行・複数人運営）を行う mobile first webapp。既存 scaffold（Bun workspaces + Turbo / Cloudflare Workers + Hono 4 / better-auth / Drizzle over D1 / React 19 + TanStack **Start** + TanStack Router + Yamada UI 2）に乗せる前提の統合設計。

> **既存 scaffold 実地検証メモ（着手前の正準事実）**: 初版で「確認済み」とした規約に複数の事実誤認があったため、実コードを再確認して以下に確定した。本書はこの実態に合わせて全面改訂している。
> - **AppType の共有経路**: `AppType` は `apps/api/src/index.ts` の単一 `app` インスタンスで `export type AppType = typeof app` され、`apps/api/src/types.ts` が `export type { AppType } from "./index"` で再エクスポートする。`@app/api` の `package.json` exports は `./types` のみ公開。Web は `import type { AppType } from "@app/api/types"` で受ける（`apps/web/src/lib/api-client.ts` で実確認）。**この間接層を必ず経由する。**
> - **requireSession は実在する**: `apps/api/src/middleware/auth.ts` に `requireSession` が既に実装済み。`getAuth(c.env).api.getSession({ headers: c.req.raw.headers })` を呼び、`c.var.user`/`c.var.session`（型は better-auth の `getSession` 戻り値由来）をセット、未認証は 401。**新規実装ではなく再利用する。**
> - **Web は TanStack Start の SSR Worker**。API へは service binding 経由の intra-Worker fetch（`api-client.ts` の `options.fetch` に `env.API.fetch.bind(env.API)`）。ブラウザからは prod=api Worker オリジン直叩き / dev=vite proxy（`/api` → `localhost:8788`）。cookie はクロスサブドメイン（`sameSite:"none"`, `crossSubDomainCookies`、`auth.ts` で実確認）。
> - **wrangler.jsonc**: `compatibility_date 2026-05-01` + `nodejs_compat`、D1、`EVENT_ROOM` Durable Object と `v1` migration を定義済み。`d1_databases[0].database_id` は本番D1のUUIDで、`task cloudflare:check` が認証先アカウントの実リソースと照合する。
> - **db**: `packages/db/src/schema/{auth.ts,index.ts}`、`zod.ts`（drizzle-zod select/insert）、`client.ts`（`createDb(d1)` → `drizzle(d1,{schema})`）。exports は `.`/`./schema`/`./zod`。`migrations_dir` は `../../packages/db/migrations`（wrangler 側に設定済み）。
> - **`@app/shared`**: `Temporal` ベースのシリアライザ（`InstantString`/`dateToInstant` 等）が既にある。enum 定数・タイマー純関数・`LiveMessage` はここに追記する。

---

## 1. 概要とアーキ全体像

### 1.1 プロダクト要件

| 機能 | 内容 |
|---|---|
| 認証 | 既存 better-auth Google OAuth（実装済み） |
| 管理イベント一覧 | 自分が owner / manager としてアサインされたイベント |
| イベント詳細（=当日運営ダッシュボード） | 入場人数カウンタ / イベント公開URL / セッション・休憩タイマー / 管理者アサイン |
| 拡張性 | イベント詳細に後から機能モジュール（OST 等）を低コストで追加 |
| MVP | 最小限。ただし当日事故防止系の小機能は最小実装で盛り込む |

### 1.2 アーキ判断（最重要）— Durable Objects 中心

リアルタイム同期の難所（複数端末でのタイマー進行同期・カウンタの競合しない合算・サーバー権威時刻）は、本質的に **「1イベントにつき単一の直列化点（serialize point）」** を要求する。Cloudflare では Durable Objects (DO) が「per-key シングルスレッド actor + WebSocket 終端 + 強整合ストレージ」をインフラとして提供するため採用する。

**3案比較:**

| 観点 | A: DO + WebSocket(Hibernation) ★採用 | B: SSE + D1 poll | C: D1 polling only |
|---|---|---|---|
| タイマー権威時刻の単一管理 | ◎ DO が唯一の状態機械 | △ 権威が D1 だが書込競合 | △ |
| カウンタ同時増減の競合（難所3） | ◎ 単一スレッドで直列化 | × lost update | × |
| 即時反映 | ◎ push | ○ 片方向 push | × 数秒遅延 |
| 双方向操作 | ◎ | △ 操作は別 HTTP | △ |
| アイドルコスト | ○ Hibernation で課金停止 | △ 接続保持で起こし続ける | ◎ |
| 実装コスト | 中 | 中〜高 | 低 |

D1 は push 非対応。SSE/poll は直列化点を別途作る必要があり DO より複雑かつ競合に弱い。よって **SSE/poll は MVP でも不採用**。

> **公開オーディエンスの扱い（レビュー: 公開 WS スケール）**: 数百〜数千の参加者接続を管理者用 `EventRoom` DO に相乗りさせると、単一スレッド・単一インスタンスの broadcast ループが管理者のリアルタイム性を巻き込んで劣化する。よって **公開 read-only 配信は管理者用 DO と同居させない**。MVP は公開 WS を作らない（§7 Won't）。Phase2 の公開ページは §3.6 の別アーキ（D1 read model 短ポーリング / 将来は fan-out 専用 DO）で再設計する。本書から「同一 EventRoom に公開接続を相乗り」記述は撤去した。

### 1.3 二層の真実の源（source of truth）

```
┌─────────────────────────────────────────────────────────────┐
│  Web (TanStack Start SSR Worker / React 19 / Router / Yamada) │
│   SSR loader: service binding fetch → REST(GET) snapshot のみ  │
│   client mount 後: WS を api Worker オリジンへ直接 Upgrade      │
│     (prod=apiサブドメイン直 / dev=vite proxy /api、§3.5)        │
└───────────────┬─────────────────────────┬───────────────────┘
                │ REST(操作 = POST/PATCH)  │ WS(read-only stream)
                ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│  API (Hono 4, basePath "/api")  ← 単一 app に .route() チェーン │
│   requireSession → requireEventMember(認可)                    │
│   操作を DO へ委譲(状態判定はDO内) / 定義CRUD は D1             │
│   export default app; export { EventRoom } from "./durable/…"  │
└───────────────┬─────────────────────────┬───────────────────┘
                │ env.EVENT_ROOM.get(id)   │ Drizzle (createDb(c.env.DB))
                ▼                          ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│ EventRoom DO (1イベント1個) │   │ D1 (SQLite, Drizzle)          │
│ 揮発+権威=ライブ状態        │   │ 永続=定義/実績/監査/初期値      │
│ - timers 状態機械(遷移判定) │←─▶│ - event / event_member        │
│ - counters 現在値(serialize)│   │ - schedule_item / counter     │
│ - 未flushキュー(WAL)        │   │ - event_module / attendance_* │
│ - idempotencyキー(永続)     │   │ write-through(節目)+WAL flush  │
│ - 接続中WS集合(presence)    │   │                               │
│ - version(単調増加)         │   │                               │
│ - DO storage に強整合ミラー │   │                               │
└──────────────────────────┘   └──────────────────────────────┘
```

- **D1 = 永続層**: イベント定義・タイムテーブル・メンバー・確定済み実績（実開始時刻・累積pause・最終status）・カウンタ確定スナップショット・監査。一覧/SSR/公開ページの read model。
- **DO = ライブ権威**: 進行中タイマーの now 基準計算、カウンタのインメモリ現在値、状態遷移の妥当性判定、WS broadcast。DO storage（強整合・永続）にミラーし hibernation 復帰時に復元。
- **D1 への書き戻し**: タイマーは**全状態遷移（start/pause/resume/complete/skip/extend）で write-through**（毎秒 tick は書かない／§2.3 の不変条件を D1 と DO storage に同時反映）。カウンタは **WAL（write-ahead）方式の write-back**（§3.4）。**DO が消えても D1 の確定列から残り時間を端末非依存で一意再構成できる**列設計にする（§2.2）。

### 1.4 用語・命名の統一（確定した正準）

| 概念 | 正準名 |
|---|---|
| イベント本体 | テーブル `event` |
| 管理者アサイン | テーブル `event_member`、role = `owner` / `manager` |
| タイムテーブル項目 | テーブル `schedule_item`、kind = `session` / `break` / `other` |
| タイマー状態 | `scheduled` / `running` / `paused` / `done` / `skipped`（overrun は独立状態にせず running 中の派生フラグ） |
| 入場カウンタ | テーブル `attendance_counter`（確定値）+ `attendance_event`（追記ログ） |
| モジュール登録 | テーブル `event_module`、moduleType = `timetable` / `attendance` / `ost`… |
| DO クラス | `EventRoom`（binding `EVENT_ROOM`、`idFromName(eventId)`） |
| WS メッセージ | `LiveMessage` 判別union（`@app/shared`） |
| 公開ページ route | `/e/:slug`（web）/ `/api/public/events/:slug`（api） |

> 主な不整合解消: タイマー完了状態 `done` / DO クラス名 `EventRoom` / カウンタは「delta 送信・絶対値 broadcast」 / モジュールキー `moduleType`。

---

## 2. データモデル（Drizzle スキーマ）

### 2.1 共通規約（既存 `auth.ts` 準拠）

- 主キー: `text("id").primaryKey()`（呼び出し側で `crypto.randomUUID()` 生成）。
- 時刻の二系統（混在の運用ミス防止のため命名規約で厳格分岐 — レビュー minor 反映）:
  - **`*At`（`createdAt`/`updatedAt`/`invitedAt` 等）= `integer(name,{mode:"timestamp_ms"})`（`Date`）**。API 境界で ISO 文字列 ⇄ `Date` 変換（`@app/shared` の Temporal シリアライザ）。
  - **サーバー権威の経過時間計算に使う列 = 生 epoch ms（`integer`/number）で列名サフィックス `_at_ms`**。DO の `Date.now()` と直接引き算、Date変換・丸めを回避。**API 境界で素通し（変換しない）**。
  - この分岐は §2.4 のシリアライザが**列名サフィックスで型レベルに強制**する（取り違えをコンパイル/レビューで検出）。
- bool: `integer(name,{mode:"boolean"})`。enum: `text(name,{enum:[...]})`（配列定数は `@app/shared` に置き db が import、循環回避）。
- 全テーブルに `createdAt`/`updatedAt`（timestamp_ms）。
- ファイル分割: `packages/db/src/schema/{event,schedule,attendance,module}.ts` → `schema/index.ts` で re-export（既存の auth re-export に追記）、`zod.ts` に drizzle-zod 追記。

### 2.2 スキーマ定義

**`schema/event.ts`**

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

export const event = sqliteTable("event", {
  id: text("id").primaryKey(),
  createdByUserId: text("created_by_user_id").notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description"),
  publicSlug: text("public_slug").unique(),       // 公開URL用。published 以降に必須
  externalUrl: text("external_url"),                // 参加者向け外部URL（任意）
  startsAtMs: integer("starts_at_ms"),              // 開催予定(epoch ms, draft時 null可)
  endsAtMs: integer("ends_at_ms"),
  timezone: text("timezone").notNull().default("Asia/Tokyo"), // IANA tz, 表示用
  status: text("status", { enum: ["draft", "published", "live", "ended", "archived"] })
    .notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("event_public_slug_uq").on(t.publicSlug),
  index("event_created_by_idx").on(t.createdByUserId),
  index("event_status_starts_idx").on(t.status, t.startsAtMs),
]);

export const eventMember = sqliteTable("event_member", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }), // 招待中はnull可
  invitedEmail: text("invited_email"),
  role: text("role", { enum: ["owner", "manager"] }).notNull().default("manager"),
  status: text("status", { enum: ["invited", "active", "revoked"] }).notNull().default("invited"),
  invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
  invitedAt: integer("invited_at", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("event_member_event_user_uq").on(t.eventId, t.userId), // null同士は衝突しない
  // 同一イベントへの同一メール二重招待を防ぐ partial unique（userId 未確定の招待のみ対象）
  uniqueIndex("event_member_event_invited_email_uq")
    .on(t.eventId, t.invitedEmail)
    .where(sql`${t.userId} IS NULL AND ${t.invitedEmail} IS NOT NULL`),
  index("event_member_user_idx").on(t.userId),       // 「自分が管理するイベント一覧」
  index("event_member_event_idx").on(t.eventId),     // 詳細でメンバー列挙
]);
```

> MVP では `invitedEmail` 経由のメール招待は実装せず「既存ユーザーを userId で直接アサイン」のみ（招待は Phase2）。列と partial unique を最初から用意し、後から低コストで有効化する（レビュー minor 反映）。

**`schema/schedule.ts` — タイマーの核心**

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { event } from "./event";

// 状態機械の不変条件（DB制約では表現しきれない分は §2.3 の純関数 assert と
// DO の write-through で保証する。再構成の正しさはこの不変条件に依存する）:
//   running  : actualStartedAtMs != null, pausedAtMs == null
//   paused   : actualStartedAtMs != null, pausedAtMs != null,
//              accumulatedPauseMs は「当該 pause を含まない」（resume 時に確定加算）
//   done/skip: endedAtMs != null
export const scheduleItem = sqliteTable("schedule_item", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["session", "break", "other"] }).notNull().default("session"),
  track: text("track").notNull().default("main"),   // 並行トラックへの将来拡張。MVPは"main"単一
  title: text("title").notNull(),
  speaker: text("speaker"),
  note: text("note"),
  orderIndex: integer("order_index").notNull(),      // 1000,2000…で採番、挿入容易
  plannedStartAtMs: integer("planned_start_at_ms"),  // タイムテーブル上の予定(任意)
  plannedDurationSec: integer("planned_duration_sec").notNull(),
  // --- 状態機械（サーバー権威時刻で再構成可能な最小列）---
  status: text("status", { enum: ["scheduled", "running", "paused", "done", "skipped"] })
    .notNull().default("scheduled"),
  actualStartedAtMs: integer("actual_started_at_ms"), // 最初にrunningした瞬間(epoch ms)
  accumulatedPauseMs: integer("accumulated_pause_ms").notNull().default(0),
  pausedAtMs: integer("paused_at_ms"),                // 現在pausedなら開始時刻、それ以外 null
  endedAtMs: integer("ended_at_ms"),                  // done/skip確定時刻
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  index("schedule_item_event_order_idx").on(t.eventId, t.orderIndex),
  index("schedule_item_event_status_idx").on(t.eventId, t.status),
]);
```

**`schema/attendance.ts` — 入場カウンタ（確定値 + 追記ログ分離 + 冪等性永続化）**

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { event } from "./event";
import { user } from "./auth";

export const attendanceCounter = sqliteTable("attendance_counter", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("main"),       // 入口名(複数ゲート対応)
  capacity: integer("capacity"),                       // 定員(任意)。超過はブロックせず警告
  currentValue: integer("current_value").notNull().default(0), // DO権威のflush値
  lastSeq: integer("last_seq").notNull().default(0),   // DOが単調増加させる順序保証用
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("attendance_counter_event_idx").on(t.eventId)]);

export const attendanceEvent = sqliteTable("attendance_event", {  // 追記専用ログ(監査+再構成)
  id: text("id").primaryKey(),
  counterId: text("counter_id").notNull()
    .references(() => attendanceCounter.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["adjust", "reset"] }).notNull().default("adjust"),
  delta: integer("delta").notNull(),                   // adjust: +1/-1/+N、reset: -(直前value)
  seq: integer("seq").notNull(),                       // DO採番。順序とlost-update不在を保証
  valueAfter: integer("value_after").notNull(),
  // hibernation/再起動を跨いでも二重計上しないための冪等キー（DO が flush 時に永続化）
  idempotencyKey: text("idempotency_key").notNull(),
  actedByUserId: text("acted_by_user_id").references(() => user.id, { onDelete: "set null" }),
  actedAtMs: integer("acted_at_ms").notNull(),         // DOのDate.now()
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  index("attendance_event_counter_seq_idx").on(t.counterId, t.seq),
  // 二重計上防止の最終防壁（DOメモリの直近Nキー判定が揮発しても D1 が弾く）
  uniqueIndex("attendance_event_counter_idem_uq").on(t.counterId, t.idempotencyKey),
]);
```

**`schema/module.ts` — 拡張の核**

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { event } from "./event";

export const eventModule = sqliteTable("event_module", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
  moduleType: text("module_type", { enum: ["timetable", "attendance", "ost"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  orderIndex: integer("order_index").notNull().default(0),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(), // 軽量設定のみ
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("event_module_uq").on(t.eventId, t.moduleType),
  index("event_module_event_idx").on(t.eventId),
]);
```

### 2.3 タイマー再構成ロジック（`@app/shared` の純関数）— 不変条件を型で表現

DO・クライアント・SSR が同一ロジックを共有し、端末時計依存を排除する。`nowMs` は常にサーバー由来（DO broadcast の `serverNowMs` か API レスポンス値）。

`TimerSnapshot` を **status による discriminated union** にし、不正な列組合せを型で排除する（レビュー critical 反映）。さらに DO/D1 のズレで異常値が来ても **`elapsed = max(0, …)` でクランプ**して負やジャンプを防ぐ。

```
elapsedMs(now) =
  status === "scheduled"        → 0
  status === "running"          → max(0, now - actualStartedAtMs - accumulatedPauseMs)
  status === "paused"           → max(0, pausedAtMs - actualStartedAtMs - accumulatedPauseMs)
  status === "done"|"skipped"   → max(0, endedAtMs - actualStartedAtMs - accumulatedPauseMs)
  ※ 上記いずれも actualStartedAtMs が null（不整合）なら 0 を返す（assert で検知 + フォールバック）

remainingMs(now) = plannedDurationSec*1000 - elapsedMs(now)
isOverrun(now)   = remainingMs(now) < 0
```

この5列（status, actualStartedAtMs, accumulatedPauseMs, pausedAtMs, endedAtMs）だけで DO storage が消えても D1 から残り時間を一意再構成できる。これが D1 永続化の主目的。**この再構成が正しいのは、pause/resume を含む全遷移が D1 へ write-through され（§3.4）、不変条件「running⇒pausedAtMs is null」「paused⇒pausedAtMs not null かつ accumulatedPauseMs に当該 pause を含まない」が常に保たれている時に限る**。resume 確定時に `accumulatedPauseMs += (now - pausedAtMs)` し `pausedAtMs = null`、その UPDATE を D1 と DO storage に**単一の状態遷移として同時反映**することで保証する。

### 2.4 drizzle-zod / `@app/shared` 方針

- `packages/db/src/zod.ts` に既存パターン（`createSelectSchema`/`createInsertSchema`）で全テーブル分追記。
- API 入力は drizzle-zod を `.pick()/.omit()/.extend()` で派生し `@hono/zod-validator` に渡す（サーバー採番列 id/createdAt/status は受け取らない）。
- **シリアライザの列名サフィックス強制（レビュー minor 反映）**: `@app/shared` に「`*_at_ms`/`*AtMs`（number）は素通し、`*At`（`timestamp_ms`=Date）は ISO 変換」を型レベルで分岐するヘルパを置く。`createdAt: Date → InstantString`、`startsAtMs: number → そのまま`。取り違えると型エラーになる。
- enum 配列定数・タイマー純関数・`LiveMessage` union・`ModuleSnapshot` union を `@app/shared` に集約（DB/API/Web/DO の単一ソース）。

```ts
// @app/shared
export const ScheduleItemStatus = z.enum(["scheduled","running","paused","done","skipped"]);
export const EventStatus = z.enum(["draft","published","live","ended","archived"]);
export const MemberRole = z.enum(["owner","manager"]);
export const ModuleType = z.enum(["timetable","attendance","ost"]);

// 不変条件を型で表現（discriminated union）
export type TimerSnapshot =
  | { id: string; plannedDurationSec: number; status: "scheduled";
      actualStartedAtMs: null; accumulatedPauseMs: number; pausedAtMs: null; endedAtMs: null }
  | { id: string; plannedDurationSec: number; status: "running";
      actualStartedAtMs: number; accumulatedPauseMs: number; pausedAtMs: null; endedAtMs: null }
  | { id: string; plannedDurationSec: number; status: "paused";
      actualStartedAtMs: number; accumulatedPauseMs: number; pausedAtMs: number; endedAtMs: null }
  | { id: string; plannedDurationSec: number; status: "done" | "skipped";
      actualStartedAtMs: number; accumulatedPauseMs: number; pausedAtMs: null; endedAtMs: number };

export function elapsedMs(s: TimerSnapshot, nowMs: number): number { /* §2.3, max(0,…) クランプ */ }
export function remainingMs(s: TimerSnapshot, nowMs: number): number { /* §2.3 */ }

// 拡張モジュールのスナップショットは discriminated union（unknown にしない＝網羅性検査が効く）
export type ModuleSnapshot =
  | { moduleType: "timetable"; data: { items: TimerSnapshot[] } }
  | { moduleType: "attendance"; data: { counters: { id: string; value: number; seq: number }[] } };
  // 追加例: | { moduleType: "ost"; data: {...} }  ← 追加すると未対応箇所がコンパイルエラー

export interface FullSnapshot {
  version: number; serverNowMs: number;
  timers: TimerSnapshot[];
  counters: { counterId: string; value: number; seq: number; capacity: number | null }[];
  modules: ModuleSnapshot[];        // exhaustive switch で描画。never チェックで漏れ検出
  presence: { count: number };
}

// DO ⇄ クライアント WebSocket メッセージ（variant 追加 → 両端コンパイルエラーで漏れ検出）
export type LiveMessage =
  | { kind: "snapshot"; version: number; serverNowMs: number; payload: FullSnapshot }
  | { kind: "timer";    version: number; serverNowMs: number; payload: TimerSnapshot }
  | { kind: "counter";  version: number; payload: { counterId: string; value: number; seq: number } }
  | { kind: "schedule"; version: number; payload: { items: TimerSnapshot[] } }
  | { kind: "presence"; version: number; payload: { count: number } };
```

---

## 3. リアルタイム同期アーキ（Durable Objects）

### 3.1 EventRoom DO

- **粒度**: `EVENT_ROOM.idFromName(eventId)` で 1イベント = 1 DO = 単一スレッド。タイマー操作・カウンタ更新が自動的に直列化される。
- **保持状態**（in-memory + DO storage に二重化）: `timers`（schedule_item ごとの `TimerSnapshot`）/ `counters`（counterId ごとの `{value, seq, capacity?}`）/ **未 flush キュー（WAL）** / **適用済み idempotencyKey 集合（storage 永続）** / 接続中 WebSocket 集合 / `version`（単調増加）。
- **storage が SQLite-backed であること**: wrangler の `migrations.new_sqlite_classes:["EventRoom"]` 前提（§4.6）。`state.storage` の KV/SQL を WAL とミラーに使う。
- **WebSocket Hibernation**: `state.acceptWebSocket()` + `webSocketMessage`/`webSocketClose` ハンドラ。アイドル時に DO がメモリ退避しても WS は維持され課金停止。タイマーは絶対時刻（`actualStartedAtMs` 等）で持つので退避→復帰しても残り時間を再計算できる。復帰時は storage から `timers`/`counters`/未flushキュー/idempotency集合を再構築する。

### 3.2 CQRS: 操作は REST、配信は WS

- **操作（タイマー開始/カウンタ増減）= Hono REST(POST)**。better-auth cookie 認可・Zod validation・`Idempotency-Key` をミドルウェアに乗せ、監査も REST + `attendance_event` で足りる。Hono → `c.env.EVENT_ROOM.get(id).fetch(internalRequest)` で DO へ委譲。
- **状態の妥当性判定（二重 start・不正遷移・カウンタ加算・reset）は必ず DO 内（単一スレッド）で行う**。REST 層は Zod validation と認可のみで、**D1 を先読みして判定しない**（read-after-write 競合を作らない — レビュー critical 反映）。409 等の不変条件違反は DO が判定し REST がその結果をそのまま返す。
- **状態配信 = WS の read-only ストリーム**。DO 側は push 一方向。

### 3.3 再同期（self-healing）

- 初回ロード/再接続: まず REST `GET /api/events/:eventId/live` で完全 `FullSnapshot`（全 timer + 全 counter + modules + `version` + `serverNowMs`）を取得 → 即描画。続いて WS 接続し以降の差分のみ受信。
- 全 WS メッセージに `version`。クライアントは「手元 version +1 でなければギャップ」と判定し、ギャップ・hibernation 跨ぎ・スリープ/バックグラウンド復帰時は再度 `GET .../live` でフル snapshot を取り直す（差分でなく全量で確実に整合）。

### 3.4 D1 永続化タイミング

- **タイマー状態遷移（start/pause/resume/complete/skip/extend）**: 低頻度・高価値 → **write-through**。DO storage 更新と同時に `createDb(c.env.DB)` の Drizzle で D1 を1行 UPDATE。**pause/resume も例外なく write-through 対象**にし、§2.3 の不変条件（pausedAtMs と accumulatedPauseMs の整合）を DO storage と D1 で常に一致させる。これにより複数回 pause/resume の中間で DO がクラッシュ→D1 復元しても elapsed が負/ジャンプしない（レビュー critical 反映）。
- **入場カウンタ（adjust/reset）**: 高頻度 → **WAL 方式の write-back**（レビュー major 反映）:
  1. 受理時に DO storage の**未 flush キューへ追記**（`{counterId, kind, delta, seq, valueAfter, idempotencyKey, actedByUserId, actedAtMs}`）してから in-memory 反映 + broadcast。**broadcast したものは必ずキューに載っている**。
  2. `state.storage.setAlarm()` で 5秒 debounce（or N件）で flush: `attendance_counter` UPSERT（value/lastSeq/updatedAt）+ `attendance_event` bulk INSERT。`attendance_event` の `(counterId, idempotencyKey)` unique 制約で二重 INSERT は弾かれる（冪等）。
  3. **D1 へ書けた分だけキューから削除**。書込失敗時はキューに残し次 alarm で再送。
  4. hibernation/再起動からの復帰時: storage のキューを読み、未 flush 分を再送。これで「broadcast 済みだが消えた delta」は発生しない。
- **idempotency の永続化**: 直近Nキーのメモリ判定（連打の即時拒否用）に加え、適用済み idempotencyKey を DO storage に保持し、flush 後は `attendance_event` の unique 制約が最終防壁。hibernation 跨ぎの再送二重計上を防ぐ（レビュー major 反映）。
- DO storage が一次ソース。D1 は分析・SSR一覧・公開ページ用 read model。

### 3.5 WS 接続先・認可（ブラウザ）— service binding を使わない経路

レビュー critical 反映。Web は SSR Worker だが **WS は service binding を通せない**ため、ブラウザから api Worker オリジンへ直接 Upgrade する。`api-client.ts` と同じ二分岐:

- **prod**: `wss://tech-event-scheduler-api.fujitanisora0414.workers.dev/api/events/:eventId/ws`（api サブドメイン直）。
- **dev**: `/api/events/:eventId/ws`（vite proxy が `localhost:8788` へ転送）。
- **SSR loader は REST snapshot のみ**取得（service binding fetch）。WS は **クライアントマウント後**に張る（loader では張らない）。層を分離して記述する。

**WS ハンドシェイク認可（cookie 不達への備え）**:
- 第一手段は cookie。prod はクロスサブドメイン cookie（`sameSite:"none"; secure; crossSubDomainCookies`、`auth.ts` で設定済み）が WS Upgrade リクエストに乗る条件を**実機検証**する。
- cookie が確実に乗らない/preflight 不可な環境向けに **短命 signed ticket 方式へフォールバック**: 認証済み REST `POST /api/events/:eventId/ws-ticket` で 60秒有効・eventId+userId+role 入りの署名トークンを発行 → ブラウザは `…/ws?ticket=…` の query param で接続。DO はハンドシェイク時に ticket を検証して membership を確定。
- いずれの方式でも **認可はハンドシェイク時に1度だけ**。以降の操作は REST で都度再認可するため WS セッションの権限昇格は起きない。

### 3.6 公開ページ配信アーキ（管理者 DO と分離）

レビュー major 反映。公開ページは Phase2。**管理者用 `EventRoom` DO に相乗りさせない**。

- **MVP/Phase2 初期**: 公開ページは **D1 read model の短ポーリング**（`GET /api/public/events/:slug`、5〜10秒間隔 or `Cache-Control` 付き）。DO の write-through により D1 は数秒遅延で進行状況を反映済み。残り時間はクライアントが §2.3 の純関数で算出するため秒単位の鮮度は不要。
- **将来（接続数が問題化したら）**: 公開専用の **fan-out DO**（管理者 DO から projection を push される read-only ブロードキャスタ）を別クラスとして導入、または degrade（SSE/ポーリングへフォールバック）。公開接続数の上限と劣化時挙動を設計で明記する。
- 公開 projection は公開フィールドのみ（イベント名・公開URL・進行中セッション名・残り時間）。member 一覧や counter 生値は出さない。

### 3.7 自動 overrun

`running` 突入時に `state.storage.setAlarm(plannedEnd)` を仕掛け、alarm 発火で **overrun フラグ + broadcast のみ**（自動 done はしない＝当日は伸びるのが普通、人間が complete を押す）。カウンタ flush alarm と overrun alarm が競合しないよう、DO は単一 alarm スロットに「次に発火すべき最小時刻」を載せ、起床時にキュー（flush 期限/overrun 期限）を全消化する設計にする。

---

## 4. API 設計（Hono RPC）

### 4.1 型共有の正準経路・ルーター構成・Variables 型

**型共有の正準経路（レビュー critical 反映）**: `index.ts` の単一 `app` チェーン → `export type AppType = typeof app` → `src/types.ts` が `export type { AppType } from "./index"` 再エクスポート → `@app/api/types`（package exports は `./types` のみ）。**新規 `routes/*.ts` は別 Hono インスタンスを new して export しない**。各 route ファイルは `const r = new Hono<AppEnv>().get(...).post(...)` の形でチェーンを途切れさせず定義し、`index.ts` の単一 `app` に `.route("/events", eventRoutes)` でマウントする。これで RPC 型が間接層を正しく通る。

**Variables 型の分離（レビュー critical 反映）**: basePath 直下の単一 app に `Variables` を足すと `/auth/*`・`/public` にも型が波及する。よって**サブルーターごとに型を分ける**:

```ts
// apps/api/src/middleware/types.ts（型定義集約）
import type { Bindings } from "../env";
import type { Auth } from "../auth";
type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

// requireSession を通すサブルーター用（events 配下）
export type AuthedEnv = {
  Bindings: Bindings;
  Variables: { user: Session["user"]; session: Session["session"] };
};
// requireEventMember を更に積むサブルーター用（events/:eventId 配下）
export type MemberEnv = {
  Bindings: Bindings;
  Variables: AuthedEnv["Variables"] & { member: { role: "owner" | "manager"; userId: string } };
};
// 認可なし（public）は素の Bindings のみ
```

- `requireSession`（**既存** `apps/api/src/middleware/auth.ts` を再利用。`getAuth(c.env).api.getSession` で取得、未認証 401）は `events` サブルーターにだけ適用。
- `requireEventMember`（新規 `apps/api/src/middleware/event.ts`）は `events/:eventId` 配下にだけ積み、`member` を `MemberEnv` で型付け。
- `/auth/*`・`/public` は `requireSession` を通さず Variables も持たない。

```ts
// apps/api/src/middleware/event.ts
import { createMiddleware } from "hono/factory";
import type { MemberEnv } from "./types";
import { getMembership } from "../repo/members"; // active な membership を1クエリ取得

export const requireEventMember = (min: "manager" | "owner" = "manager") =>
  createMiddleware<MemberEnv>(async (c, next) => {
    const member = await getMembership(c.env.DB, c.req.param("eventId")!, c.var.user.id);
    if (!member || member.status !== "active") return c.json({ error: "Forbidden" }, 403);
    if (min === "owner" && member.role !== "owner") return c.json({ error: "Forbidden" }, 403);
    c.set("member", { role: member.role, userId: c.var.user.id });
    await next();
  });
```

`index.ts` マウント例（既存チェーンに追記。DO クラス export も追加）:
```ts
const app = new Hono<{ Bindings: Bindings }>()
  .basePath("/api")
  .use(secureHeaders())
  .use(/* cors 既存 */)
  .route("/health", healthRoutes)                 // 既存
  .on(["GET","POST"], "/auth/*", (c) => getAuth(c.env).handler(c.req.raw)) // 既存
  .route("/events", eventRoutes)                  // requireSession を内部で適用
  .route("/public", publicRoutes);                // 認可なし・read-only projection

export type AppType = typeof app;
export default app;
export { EventRoom } from "./durable/event-room"; // ★ DO クラスを main から export（§4.6）
```

### 4.2 エンドポイント表（すべて basePath `/api` 配下）

**Events**
| method | path | 認可 | req | res |
|---|---|---|---|---|
| GET | `/events` | session | — | 自分が member のイベント一覧 |
| POST | `/events` | session | `{title, timezone?, startsAtMs?}` | 作成（作成者を owner として `event_member` 自動INSERT、トランザクション内） |
| GET | `/events/:eventId` | member | — | 詳細（メタ + members + schedule_items + counters定義 + enabled modules） |
| PATCH | `/events/:eventId` | manager | `{title?, startsAtMs?, publicSlug?, externalUrl?}` | 更新 |
| DELETE | `/events/:eventId` | owner | — | 論理削除（status=archived） |
| GET | `/events/:eventId/live` | member | — | フル `FullSnapshot`（DO fetch 経由） |
| POST | `/events/:eventId/ws-ticket` | member | — | WS 認可フォールバック用の短命 signed ticket（§3.5） |

**Members** (`/events/:eventId/members`) — owner 不変条件は D1 原子操作で保証（下記）
| method | path | 認可 | 備考 |
|---|---|---|---|
| GET | `.../members` | member | アサイン済み管理者一覧 |
| POST | `.../members` | owner | `{userId, role}` アサイン（MVP: 既存ユーザー直接。Phase2 で email 招待） |
| PATCH | `.../members/:userId` | owner | `{role}` ロール変更（owner→manager は §4.5 の原子条件付き） |
| DELETE | `.../members/:userId` | owner | 解除（最後の owner は外せない→409、§4.5 で TOCTOU 回避） |

**Schedule items** (`/events/:eventId/schedule`)
| method | path | 認可 | 備考 |
|---|---|---|---|
| GET | `.../schedule` | member | item一覧（orderIndex 昇順） |
| POST | `.../schedule` | manager | `{title, kind, plannedDurationSec, track?, orderIndex?}` 追加 |
| PATCH | `.../schedule/:itemId` | manager | `{title?, plannedDurationSec?, ...}` 編集 |
| DELETE | `.../schedule/:itemId` | manager | 削除（running 中は DO 判定で 409） |
| POST | `.../schedule/reorder` | manager | `{orderedItemIds:string[]}` 一括並び替え→DO へ通知 broadcast |

**Timer 操作**（**判定主体は DO**。REST は validation/認可のみ。すべて `Idempotency-Key` ヘッダ受理、res = 更新後 `TimerSnapshot` + version）
| method | path | DO 内処理 |
|---|---|---|
| POST | `.../schedule/:itemId/timer/start` | **同 track に running があれば 409**（判定は DO 内）。`actualStartedAtMs` 採番 |
| POST | `.../schedule/:itemId/timer/pause` | running→paused（`pausedAtMs` セット）。write-through |
| POST | `.../schedule/:itemId/timer/resume` | paused→running（`accumulatedPauseMs += now-pausedAtMs`、`pausedAtMs=null`）。write-through |
| POST | `.../schedule/:itemId/timer/complete` | →done（`endedAtMs` セット） |
| POST | `.../schedule/:itemId/timer/skip` | →skipped |
| PATCH | `.../schedule/:itemId/timer/extend` | `{deltaSec}` plannedDuration 延長（overrun の正攻法） |

**Counter 操作**（**判定・加算は DO 内**）
| method | path | 備考 |
|---|---|---|
| GET | `.../counters` | カウンタ定義 + 現在値 |
| POST | `.../counters` | `{name, capacity?}` 入口追加 |
| POST | `.../counters/:counterId/adjust` | `{delta}` + `Idempotency-Key` → DO 内で直列加算 `{value, seq}` |
| POST | `.../counters/:counterId/reset` | `Idempotency-Key` → DO 内で value=0・seq++・`attendance_event(kind=reset, delta=-prev)` 記録（§4.4） |
| DELETE | `.../counters/:counterId` | 削除 |

**WebSocket**
| method | path | 認可 | 備考 |
|---|---|---|---|
| GET | `/events/:eventId/ws` | member（cookie or ticket、§3.5） | Upgrade。DO proxy。timer/counter/schedule/presence の差分を version 付き push。**prod は api オリジン直、dev は vite proxy** |

**公開ページ**（別ルーター `/public`、`requireSession` 不通過・read-only projection）
| method | path | 認可 | 備考 |
|---|---|---|---|
| GET | `/public/events/:slug` | なし | 公開フィールドのみ。member 一覧/counter 生値は出さない。Phase2、§3.6 の短ポーリング前提 |

> 公開 WS は MVP では作らない（§7 Won't）。Phase2 でも管理者 DO 相乗りではなく §3.6 の別アーキで提供する。

### 4.3 タイマー状態機械（サーバー権威・判定は DO 内）

```
            ┌──────────┐  start   ┌──────────┐  pause   ┌──────────┐
            │ scheduled │ ───────▶ │ running   │ ───────▶ │ paused    │
            └──────────┘          └──────────┘ ◀──────── └──────────┘
                 │              complete│  │ resume          │ complete
            skip │            (次へ/手動) │  │                 │
                 │                       ▼  ▼ skip            ▼
                 │                  ┌──────────┐         ┌──────────┐
                 └─────────────────▶│ skipped  │         │  done    │
                                    └──────────┘         └──────────┘

  running 中に plannedEnd 到達 → overrun フラグ立てる（status は running のまま）
```

- **判定主体は EventRoom DO（単一スレッド）**。「同 track に running は最大1つ」「不正遷移の拒否」をすべて DO 内で行い、違反は 409 相当を返す。REST 層は **D1 を先読みして判定しない**（二重 start 防止 — レビュー critical 反映）。MVP は track="main" のみ＝グローバルに1つ。休憩は `kind="break"` の通常 item として直列に挟む。
- **overrun は独立状態にしない**。`running` のまま `remaining<0` で表現、UI で赤＋経過カウントアップ。自動 complete せず人間が判断。
- pause/resume は §2.3 の不変条件を保ったまま D1 へ write-through（§3.4）。

### 4.4 カウンタ並行制御 + reset セマンティクス

1. クライアント→サーバー: `{ delta:+1|-1|+N }`（**絶対値 PUT にしない**＝2端末同時の lost update を防ぐ）。`Idempotency-Key`（UUID）必須。
2. EventRoom DO 単一スレッドが受理 → idempotency 判定（メモリ直近Nキー + storage 永続集合）→ WAL キュー追記 → `seq++`、`value=Math.max(0, value+delta)`、`valueAfter` 確定 → **全接続に絶対値 broadcast**。
3. WAL → alarm flush（§3.4）。`attendance_event(counterId, idempotencyKey)` unique で二重 INSERT を最終防止。
4. lost update は DO 単一スレッド + 単調 seq で原理的に発生しない。capacity 超過はブロックせず警告。
5. **reset（レビュー major 反映）**: `POST .../counters/:counterId/reset` を DO が受理 → `prev=value` を読み `value=0`・`seq++` → `attendance_event(kind="reset", delta=-prev, valueAfter=0, idempotencyKey)` を WAL に積む → broadcast。adjust の「-現在値 delta」で擬似 reset すると他端末の同時 +1 で 0 にならない競合があるため、専用操作で**読み取りと書き込みを DO 内で原子化**する。UI の「リセット」はこの操作に紐付ける。

### 4.5 メンバー変更の原子性（owner 不変条件）

レビュー major 反映。`event_member` は D1 直書きで DO を通さないため、2端末から同時に owner を DELETE/降格すると両方が「自分以外に owner が居る」と読んで owner ゼロになる TOCTOU が起きる。**アプリ層の事前チェックに頼らず D1 の条件付き更新で原子化する**:

- DELETE（最後の owner 保護）:
  ```sql
  DELETE FROM event_member
  WHERE event_id=? AND user_id=? AND status='active'
    AND ( role <> 'owner'
       OR (SELECT count(*) FROM event_member
           WHERE event_id=? AND role='owner' AND status='active') > 1 );
  ```
  影響行 0 件なら「最後の owner」と判断し 409。SQLite の単一文 DELETE は原子的なので、同時 2 リクエストでも片方しか成立しない。
- PATCH（owner→manager 降格）も同型の条件付き UPDATE（`role='manager'` への変更を、owner が2人以上ある時のみ許可）にする。
- 将来さらに厳密化が必要なら、メンバー変更も `EventRoom` DO 経由に寄せて直列化する余地を残す。

### 4.6 wrangler / DO 同居・D1管理

レビュー major 反映。

- **DO クラス export**: DO を api Worker に同居させるため、`main` エントリ `index.ts` から `export { EventRoom } from "./durable/event-room"` する（§4.1 のマウント例に記載済み）。
- **wrangler.jsonc 追記 diff**:
  ```jsonc
  "durable_objects": {
    "bindings": [{ "name": "EVENT_ROOM", "class_name": "EventRoom" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["EventRoom"] }  // storage は SQLite-backed
  ]
  ```
- **D1の実リソース照合**: 本番D1 `tech-event-scheduler` のUUIDを `d1_databases[0].database_id` に固定し、変更前とデプロイ前に `task cloudflare:check` で認証先アカウントの同名D1・UUID・Worker Secrets・Worker versions・未適用migrationをread-only確認する。新規環境だけ `task cloudflare:bootstrap` を使い、既存D1は自動削除しない。

---

## 5. 画面設計

### 5.1 ルート構成（TanStack Start / file-based router）

```
apps/web/src/routes/
├── __root.tsx                         # 既存。UIProvider + ColorModeScript
├── index.tsx                          # "/" → /events リダイレクト（認証済）
├── login.tsx                          # 既存。Google OAuth
├── _authed.tsx                        # pathless layout: セッションガード + AppShell
├── _authed/
│   ├── events.tsx                     # "/events" 一覧コンテナ + FAB
│   ├── events.index.tsx               # 管理イベント一覧
│   ├── events.new.tsx                 # 新規作成
│   ├── events.$eventId.tsx            # 詳細レイアウト = タブシェル + WS接続を1回確立(client)
│   ├── events.$eventId.index.tsx      # 既定タブ = Live（運営ダッシュボード本体）
│   ├── events.$eventId.timetable.tsx  # タイムテーブル編集
│   ├── events.$eventId.members.tsx    # メンバー管理
│   ├── events.$eventId.settings.tsx   # 設定（名前/公開URL/日時）
│   └── events.$eventId.modules.$moduleType.tsx  # ★モジュール汎用ルート(OST等)
└── e.$slug.tsx                        # "/e/:slug" 公開ページ（未認証・SSR・§3.6 短ポーリング）
```

- 認証ガードは `_authed.tsx` の `beforeLoad` で `auth-client` セッション確認 → 未認証は `/login`。
- **loader / WS の層分離（レビュー critical 反映）**: `events.$eventId.tsx` の **loader は REST snapshot のみ**（SSR は service binding fetch、ブラウザは api オリジン直 fetch）。**WS はコンポーネント mount 後**に1回だけ確立し子タブで context 共有（タブ切替で再接続しない）。loader で WS を張らない。

### 5.2 AppShell（全認証画面共通）

```
┌──────────────────────────────────────┐
│ ◀  TechConf 2026          ● LIVE  ⟳  │ ← 戻る / イベント名 / 接続状態チップ
├──────────────────────────────────────┤
│            （各画面コンテンツ）          │
├──────────────────────────────────────┤
│  ⏱ Live   🗓 進行表   👥 メンバー  ⚙   │ ← 下部タブ(親指届く位置, safe-area)
└──────────────────────────────────────┘
```

- 接続状態チップ: `connected`(緑●) / `reconnecting`(黄⟳) / `offline`(灰)。Yamada `Badge`+`Tag`+`Loading`。
- 下部固定 Bottom Tab（`HStack`+`IconButton`+`position="fixed" bottom={0}`、自作）。タップターゲット最小 48px、主要操作 64px+。
- カラーモード端末追従。Live は屋外視認のため明色ハイコントラスト + サイズ/太字で階層化。等幅数字（`tabularNums`）。

### 5.3 当日運営ダッシュボード（Live タブ）— 重点

```
┌──────────────────────────────────────┐
│ ◀ TechConf 2026         ● LIVE   ⟳   │
├──────────────────────────────────────┤
│  NOW · セッション 2/8                  │ ← 進行位置
│  ┌────────────────────────────────┐  │
│  │   基調講演: AIの現在地           │  │ ← 現在 schedule_item
│  │        12:34                    │  │ ← 巨大タイマー(残り) 64px+ mono
│  │   ████████████░░░░  予定 45:00   │  │ ← Progress バー
│  │        ⚠ +2:10 超過              │  │ ← overrun時のみ赤(running継続)
│  │  ┌────────┐  ┌────────┐        │  │
│  │  │ ⏸ 一時停止│  │ 次へ ▶▶ │        │  │ ← 64px高
│  │  └────────┘  └────────┘        │  │
│  │      [ スキップ ]  [ +5分 ]      │  │ ← 副次操作
│  └────────────────────────────────┘  │
│  NEXT ▸ 休憩 (15:00)                  │ ← 次アイテムプレビュー
│ ──────────────────────────────────── │
│  入場者数                              │
│  ┌────────────────────────────────┐  │
│  │   ┌────┐    342    ┌────┐       │  │ ← 現在値 巨大表示
│  │   │ ―  │  ───────  │ ＋ │       │  │ ← 72px円ボタン
│  │   └────┘  入場済み   └────┘       │  │
│  │     [ +10 ] [ 履歴 ] [ リセット ]  │  │ ← リセットは reset 専用API(§4.4)
│  └────────────────────────────────┘  │
│ ──────────────────────────────────── │
│  ──────── モジュール ────────         │ ← event_module の LiveCard 自動列挙
│  ┌──────────────┐ ┌──────────────┐  │
│  │ 🗳 OST 投票12件 │ │ ❓ Q&A 未回答3 │  │
│  │   [ 開く ▸ ]   │ │  [ 開く ▸ ]   │  │
│  └──────────────┘ └──────────────┘  │
│  ▸ 共有 / QR        ▸ メンバー(3)      │ ← Accordion
├──────────────────────────────────────┤
│  ⏱ Live   🗓 進行表   👥 メンバー  ⚙   │
└──────────────────────────────────────┘
```

- **タイマー描画**: WS から `serverNowMs` を受け取り `clientSkew = clientNow - serverNowMs` を保持、以後ローカル interval で `remainingMs()` を再計算（毎秒通信不要）。skew は再 snapshot のたびに補正、端末時計依存なし。
- **「次へ ▶▶」**: 現在を done、次の scheduled を start（DO が直列に判定）。誤タップ防止に確認スナックバー（Undo 5秒）。
- **カウンタ**: ± は delta 送信、楽観的更新（即 +1 表示）→ DO 確定値で補正。右に ＋（右手親指の弧）、左に −。「リセット」は §4.4 の reset 専用 API。「履歴」= `attendance_event` の誰が・いつ・±n・reset。

### 5.4 リアルタイム UX（保留キューの整合を種別ごとに定義）

レビュー minor 反映。offline 中の保留キューと再接続後の最新状態の突合を種別で分ける。

| 事象 | UX挙動 |
|---|---|
| 他端末がタイマー操作 | カードが即 running/paused に切替。トースト「田中さんが開始しました」2秒。tick はローカル継続 |
| 他端末がカウンタ操作 | 数字カウントアップアニメ、楽観値とマージ（seq 順） |
| 自分の操作 | 即時楽観反映 → DO ack で確定（500ms来なければボタンに spinner） |
| 切断検知 | ヘッダ黄`⟳`。**カウンタ delta（可換・冪等キー付き）は保留キューに積み自動再送可**。**タイマー状態遷移は保留しても自動再送しない**（下記） |
| 再接続成功 | DO から full snapshot で同期。緑`● LIVE`、「同期しました」トースト |
| 保留中タイマー操作の突合 | 再接続後に `GET /live` の最新 version/status と突合。**状態が前提通りでなければ保留遷移を破棄してユーザーに再操作を促す**（古い start/complete の誤適用を防止） |
| 保留中カウンタ delta | 冪等キー付きで自動再送（DO + D1 unique で二重計上なし）。可換なので順序非依存 |
| 長時間オフライン | 全画面オーバーレイ + 手動リロード |
| iOS Safari バックグラウンド/bfcache 復帰 | WS が切れている前提で、**復帰時は必ず `GET /live` で再 snapshot** してから WS 再接続。skew も再補正 |

### 5.5 Yamada UI 当て込み（主要）

巨大タイマー=`Text fontSize="6xl" fontWeight="black" fontFamily="mono"`（tabularNums）/ 進捗=`Progress`(overrun `colorScheme="red"`) / カウンタ=`IconButton rounded="full" boxSize="72px"` / 接続=`Tag`+`Loading` / 折りたたみ=`Accordion` / 招待・編集=`Drawer placement="bottom"` / 通知=`useNotice`(Undo付き) / QR=`Card`+`useClipboard`+QRライブラリ。アイコン+ラベル両方（屋外誤認防止）。

---

## 6. 拡張性設計（OST 等モジュール追加）

「集計・リアルタイム同期・順序が絡む実データ」を扱うため汎用 JSON 単独では破綻する。**A（モジュール別専用テーブル）を基盤に、限定的 JSON（軽量設定のみ）を併用する折衷案 C** を採用。

**3層すべてに拡張ポイント:**

- **スキーマ層**: 新モジュールは「専用テーブル群（例 `ost_board`/`ost_topic`/`ost_vote`、`event_id` 紐付け）+ `module_type` enum に1値追加」だけ。`event_module` 構造は不変。軽量設定は `config` JSON。
- **API 層**: `apps/api/src/routes/modules/ost.ts` を1ファイル追加し、**単一 app チェーンに** `.route("/events/:eventId/modules/ost", ostRoute)` を1行（§4.1 規約：別インスタンスを new しない）。`requireEventMember` 再利用で認可は書き直し不要。`AppType` チェーンで Web 型自動追随。
- **DO 層**: `LiveMessage` 判別 union に variant 追加（OST 投票も「DO 内で直列加算→version++→broadcast」という counter と同型）。
- **拡張の網羅性検査（レビュー minor 反映）**: `FullSnapshot.modules` を `Record<string, unknown>` ではなく **`ModuleSnapshot` の discriminated union**（§2.4）にし、未対応 `moduleType` を `never` で弾く exhaustive switch にする。これで「variant 追加で両端コンパイルエラー検出」の利点が modules ペイロードにも効く。
- **画面層**: 詳細画面は `event_module` を orderIndex 順に取得し `moduleType → React コンポーネント` のレジストリで動的描画。

```ts
// apps/web/src/modules/registry.ts
import type { ModuleType } from "@app/shared";
export type EventModule = {
  moduleType: ModuleType; label: string; icon: ReactNode;
  LiveCard?: FC<{ eventId: string }>;   // Liveダッシュボードのサマリーカード(任意)
  Page: FC<{ eventId: string }>;        // タブ本体
};
export const moduleRegistry: EventModule[] = [/* timetable, attendance, ... */];
```

タブナビは registry から動的生成。汎用 `events.$eventId.modules.$moduleType.tsx` が `registry.find(m => m.moduleType === moduleType)?.Page` をレンダリングするだけ。**新モジュール = registry に1エントリ + Page 実装 + `ModuleSnapshot` に1 variant**（新ルートファイル不要）。

> MVP 時点で `timetable` / `attendance` を全イベントに自動登録しておくと、将来モジュールと同じ描画パスに最初から乗せられ UI 分岐が消える。

---

## 7. MVP スコープ（MoSCoW）とロードマップ

### 7.1 MoSCoW

**Must（無いと当日運営が成立しない）**
認証（既存）/ 管理イベント一覧 / イベント作成・詳細 / 入場カウンタ（DO 直列化）/ タイマー（サーバー権威・状態機械・判定は DO 内）/ 管理者アサイン（既存ユーザー直接、owner 不変条件は D1 原子操作）/ DO+WebSocket 同期 / mobile first UI。

**Should（MVP に最小で入れる・低コストで現場事故防止）** — 実装コストを現実的に見積り直し
1. **再接続耐性**（WS 自動再接続 + 接続時 full snapshot 再同期、指数 backoff、バックグラウンド/bfcache 復帰で必ず再 snapshot）。会場電波弱は前提。**保留キューは種別分け（§5.4）**を含むため、初版見積より工数大。
2. **誤操作防止**（complete/skip/reset に確認 + Undo スナックバー、カウンタは Idempotency-Key + seq + DO/D1 二重防止）。
3. **QR 共有**（公開URLをその場で参加者に提示、フロント1コンポーネント）。
4. **残り少/超過アラート**（残り n 秒で色変化 + `navigator.vibrate`、overrun は赤＋経過カウントアップ、クライアント描画のみ）。
5. **接続者プレゼンス表示**（「今 3 人が見ています」、DO の WS 集合 broadcast）。

**Could（Phase2 先頭）**
参加者向け公開ページ（read-only タイムテーブル、§3.6 短ポーリング）/ タイムテーブルのドラッグ並び替え（MVP は上下ボタン代替）/ ダーク・高コントラストモード。

**Won't（now）**
公開向け WS リアルタイム配信（§3.6 で管理者 DO と分離して Phase2 以降に別アーキ）/ メール・リンク招待（MVP はアサインで足りる）/ タイムゾーン横断UI（単一会場前提・epoch ms 保持で将来容易）/ 監査ログ表示（`attendance_event` の insert だけ用意、表示は後）/ イベント複製 / OST 等モジュール本体（拡張構造のみ用意）/ 完全オフライン書込（再接続耐性で代替）。

### 7.2 ロードマップ

- **Phase 1（MVP）**: 認証 / イベント CRUD・一覧・詳細 / アサイン（owner 原子保証）/ DO+WS 同期・タイマー状態機械（DO 判定）・カウンタ直列化（WAL flush・reset・冪等永続化）/ timetable・attendance モジュール / Should 5点。
- **Phase 2**: 公開イベントページ（`/e/:slug`、§3.6 短ポーリング）/ OST モジュール（`ModuleSnapshot` union 拡張の実証）/ メール・リンク招待（partial unique 有効化）/ 監査ログ表示 / ドラッグ並び替え。
- **Phase 3**: 公開向けリアルタイム配信（fan-out DO）/ PWA・オフライン書込キュー（衝突解決）/ ダーク・高コントラスト / イベント複製・テンプレート / タイムゾーン横断UI / 参加者向け push 通知。

---

## 8. 実装着手順序

0. **Cloudflare前提確認**: `task cloudflare:check` で `apps/api/wrangler.jsonc` のD1 UUIDと認証先アカウントの実D1、Worker Secrets、API/Web Worker versions、未適用migrationを照合する。新規環境のD1作成だけ `task cloudflare:bootstrap` を使う。
1. **DB スキーマ**: `packages/db/src/schema/{event,schedule,attendance,module}.ts` 追加 → `schema/index.ts` で re-export（既存 auth に追記）→ `zod.ts` に drizzle-zod 追記。
2. **共有層**: `@app/shared` に enum 配列定数・`TimerSnapshot`（discriminated union）・`elapsedMs`/`remainingMs`（クランプ付き純関数）・`LiveMessage`・`ModuleSnapshot`/`FullSnapshot`・列名サフィックス分岐シリアライザを追加。
3. **マイグレーション**: `drizzle-kit generate` → `packages/db/migrations` へ出力 → `wrangler d1 migrations apply`（`migrations_dir` 設定済み）。
4. **wrangler 設定**: `apps/api/wrangler.jsonc` に `durable_objects.bindings`（`EVENT_ROOM`→`EventRoom`）+ `migrations`（`new_sqlite_classes:["EventRoom"]`）追記（§4.6 diff）。`index.ts` に `export { EventRoom } from "./durable/event-room"` 追加。
5. **認可ミドルウェア**: `middleware/types.ts`（`AuthedEnv`/`MemberEnv`）+ `middleware/event.ts`（`requireEventMember`）。**`requireSession` は既存 `middleware/auth.ts` を再利用**。
6. **REST（定義 CRUD）**: `routes/events.ts`・`members`（D1 のみで先に動かす。owner 不変条件は §4.5 の条件付き SQL）。`index.ts` の単一 app に `.route("/events", ...)` マウント（別インスタンス禁止）。型が `index → types.ts → @app/api/types` を通ることを確認。
7. **EventRoom DO**: `apps/api/src/durable/event-room.ts`（Hibernation WS + counter serialize + reset + timer 状態機械（遷移判定は DO 内）+ alarm overrun + WAL flush + idempotency 永続 + DO storage ミラー + D1 write-through/back）。
8. **Live REST + WS**: `GET /events/:eventId/live`（DO fetch）・`/events/:eventId/ws`（DO proxy、prod=api オリジン直/dev=vite proxy、cookie or ticket 認可）・`POST /events/:eventId/ws-ticket`・timer/counter/reset 操作エンドポイント（DO 委譲、Idempotency-Key、判定は DO）。
9. **Web**: `_authed` ガード + AppShell → 一覧/作成 → `events.$eventId.tsx`（**loader は REST snapshot のみ、WS は client mount 後**）+ Live ダッシュボード（タイマー・カウンタ）→ timetable/members/settings。
10. **モジュールレジストリ**: `apps/web/src/modules/registry.ts` + 汎用 `modules.$moduleType.tsx`、timetable/attendance 登録。`ModuleSnapshot` 網羅 switch。
11. **Should 機能**: 再接続再同期（種別分け保留キュー・bfcache 復帰再 snapshot）・確認/Undo・QR・アラート・presence を Live に重ねる。
12. **公開ページ（Phase2 冒頭）**: `routes/public.ts`（projection、§3.6 短ポーリング）+ `e.$slug.tsx`（SSR）。**管理者 DO 相乗りはしない**。

主要新規ファイル（絶対パス）:
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/packages/db/src/schema/{event,schedule,attendance,module}.ts`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/packages/db/src/{schema/index.ts,zod.ts}`（追記）
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/packages/shared/src/index.ts`（追記）
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/api/src/durable/event-room.ts`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/api/src/middleware/{types,event}.ts`（`auth.ts` の `requireSession` は既存・再利用）
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/api/src/repo/members.ts`（`getMembership` 等）
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/api/src/routes/{events,schedule,counters,timers,public}.ts` + `modules/ost.ts`（Phase2）
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/api/{src/index.ts,src/types.ts,wrangler.jsonc}`（追記 — `index.ts` に DO export と `.route()` チェーン）
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/routes/_authed.tsx` + `_authed/events.*.tsx` + `e.$slug.tsx`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/modules/registry.ts`
