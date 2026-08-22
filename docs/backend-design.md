# tech-event-scheduler バックエンド詳細設計書（最終版 / レビュー反映済み）

docs/design.md（確定版）の §1〜§8 を、4 観点（API 層 / repo・永続化層 / EventRoom DO / テスト・CI・運用）で詳細化し、観点間の表記揺れと FE↔BE 契約欠陥を解消して 1 本に統合する。既存 scaffold（`env.ts` / `middleware/auth.ts` / `api-client.ts` / `index.ts` 実確認済み）に整合させる。確定事項（DO 中心、CQRS、5 列サーバー権威再構成、WAL+冪等、moduleType 拡張、id=text/`crypto.randomUUID()`、`*_at_ms`/`*At` 二系統、`index.ts→types.ts→@app/api/types` 経路、`requireSession` 再利用、`AuthedEnv`/`MemberEnv` 分離、owner 不変条件の D1 原子操作）は覆さない。

## 統合にあたり確定した命名・契約（観点間／FE↔BE 不一致の解消）

レビューで指摘された contract 欠陥を含め、本書で次のとおり一意に固定する。実装者（BE/FE/DO）はこの表に従う。

| 項目 | 確定値 | 棄却した別案 |
|---|---|---|
| api⇄DO 内部コマンド POST パス | `INTERNAL_COMMAND_PATH = "/__room/command"` | `/__do/command` |
| api⇄DO 内部 WS Upgrade パス | `INTERNAL_WS_PATH = "/__room/ws"` | `/__do/ws` |
| **WS ticket の受け渡し媒体** | **`x-ws-ticket` 内部ヘッダ**（api が元 query `?ticket=` を読み、内部 Request の**ヘッダに移送**して DO へ渡す。クエリ脱落を構造的に排除）。同時に**元 URL の `search` も保持**して内部 URL を組み立てる（二重防壁） | 内部固定 URL でクエリ脱落（critical 欠陥）、query 単独依存 |
| **Timer 操作の REST パス** | **`/events/:eventId/schedule/:itemId/timer/{start,pause,resume,complete,skip,extend}`**（`timerRoutes` を `scheduleRoutes` の `/:itemId/timer` 配下にマウントし `:eventId`/`:itemId` 両 param を継承）。design.md §4.2 に厳密一致 | `/start` 独立マウント（itemId 供給元不明・critical 欠陥） |
| **ErrorBody / ErrorCode の単一ソース** | **`@app/shared`**（BE `errors/index.ts` と FE `api-error.ts` の双方が import）。FE `ApiError.code: ErrorCode` | BE `errors/index.ts` ローカル定義 + 文字列複製（drift・major 欠陥） |
| **Idempotency-Key の RPC 露出** | **`zValidator("header", idempotencyHeaderSchema)`** を timer/counter write 全 mutation に併用 → RPC 型に必須ヘッダが現れ、FE 付与漏れがコンパイルエラー | `c.req.header()` 直読みのみ（型に出ず付与漏れ未検出・major 欠陥） |
| 契約型ファイル | `apps/api/src/durable/protocol.ts`（単一ソース） | 重複定義 |
| api 側委譲ラッパ | `apps/api/src/lib/do.ts` の `callRoom<C>()` | `durable/client.ts` の `sendCommand` |
| **WS broadcast の wire 型** | **`@app/shared` の `LiveMessage` のみ**（REST 専用 `RoomResult` とは別物）。`counter` variant は `serverNowMs` を**含めない**（design.md §2.4 準拠、FE `clock.sync` 対象外） | DO が `RoomResult` を WS 流用し counter に `serverNowMs` 混入（構造ズレ・major 欠陥） |
| DO→api エラー応答 | `{ ok: false } & ErrorBody`（`code` 由来の HTTP status を返す。§5.9） | 200 固定（観測性低下・minor 指摘） |
| ID 生成 | `crypto.randomUUID()`（repo `ids.ts` の `newId()` でラップ） | — |
| repo 関数の第1引数 | 必ず `Database`（`createDb` の戻り型） | — |
| 自 eventId の DO への受け渡し | 内部 fetch の `x-event-id` ヘッダ（version を**触らない**専用確定メソッド。§5.3） | persistVersion 流用（version 巻き戻りリスク・major 欠陥） |
| getMembership の絞り込み | `and(eventId, userId, status='active')`（active 行のみ・twin-row 非決定性排除） | `eq(userId)` のみ + limit(1)（誤 403・critical 欠陥） |

---

## 1. 全体方針とレイヤ構成

### 1.1 二層 source of truth（design.md §1.3 踏襲）

- **D1 = 永続層 / read model**: 定義（event/member/schedule/counter/module）・確定実績（タイマー5列・カウンタ確定値+監査ログ）・SSR/一覧/公開ページ用。
- **EventRoom DO = ライブ権威**: 進行中タイマーの now 基準計算、カウンタ in-memory 現在値、状態遷移の**妥当性判定（単一スレッド）**、WS broadcast、version 単調増加。DO storage（SQLite-backed、強整合）に全状態をミラーし hibernation 復帰時に復元。
- **書き戻し規律**: タイマーは全状態遷移で **write-through**（storage → in-memory → D1 → version → broadcast の順）。カウンタは **WAL write-back**（WAL 追記 → in-memory → 永続 → broadcast、flush は alarm 駆動・冪等三段防壁）。

### 1.2 CQRS（design.md §3.2）

- **操作（write）= Hono REST**。認可（`requireSession`+`requireEventMember`）・Zod validation・`Idempotency-Key`（**header validator で RPC 型に露出**）を REST 層で済ませ、**状態妥当性判定は DO 内のみ**。REST は D1 を先読みして判定しない（read-after-write 競合を作らない）。
- **配信（read stream）= WebSocket**（DO push 一方向、read-only）。wire 型は `@app/shared` の `LiveMessage` のみ。
- 定義 CRUD は DO を通さず D1 直書き（owner 不変条件のみ条件付き原子 SQL）。

### 1.3 一方向 layering（全観点共通の依存規約）

```
route handler
   → schemas/*（Zod validation: json + header）
   → errors/*（DomainError, code は @app/shared 由来）
   → repo/*（D1 / Drizzle）  または  lib/do.ts（DO 委譲）
        → drizzle(createDb)   |   EventRoom（callRoom 経由）
@app/shared（enum 配列・TimerSnapshot・LiveMessage・ErrorBody/ErrorCode・純関数・シリアライザ）は全層から import
```

- handler は Drizzle を直呼びしない（必ず `repo/*` 経由）。DO は `lib/do.ts` の型付きラッパ経由でのみ呼ぶ。
- **enum 値配列・`ErrorBody`/`ErrorCode` の単一ソースは `@app/shared`**。`@app/db` が `text(name,{enum})` と zod の両方にこの配列を食わせる。`@app/shared` は db/drizzle を一切 import しない（deps は `temporal-polyfill`/`zod` のみ）→ db→shared 一方向で循環しない。
- 入力スキーマ（body/header）は api 内 `schemas/`。出力 wire 型（`TimerSnapshot`/`FullSnapshot`/`LiveMessage`/`ModuleSnapshot`/`ErrorBody`/`ErrorCode` と enum）は `@app/shared`（DO/Web/SSR 共有）。境界はシリアライザ（`*At`=Date→ISO / `*_at_ms`=number 素通し）。

---

## 2. ディレクトリ構成と各ファイル責務

```
packages/shared/src/
├── index.ts            # 追記: enum 配列/zod enum, TimerSnapshot union, elapsedMs/remainingMs/isOverrun,
│                       #        LiveMessage/ModuleSnapshot/FullSnapshot, ErrorBody/ErrorCode(★単一ソース),
│                       #        Serialized<T>/serializeRow
└── *.test.ts           # L1 純関数テスト（node 環境）

packages/db/src/
├── schema/{event,schedule,attendance,module}.ts  # 新規 Drizzle テーブル
├── schema/index.ts     # 追記: 新テーブル re-export（client.ts は無改修で自動収集）
├── zod.ts              # 追記: createInsert/SelectSchema 全テーブル
├── client.ts           # 無改修（import * as schema）
├── seed.ts             # 開発 seed
└── zod.test.ts         # L1

apps/api/src/
├── index.ts            # ★単一 app チェーン。.route("/events"|"/public"), app.onError, export { EventRoom }
├── types.ts            # 無改修（export type { AppType } from "./index"）
├── env.ts              # 追記: Bindings に EVENT_ROOM（EnvSchema は無改修）
├── auth.ts             # 無改修
├── middleware/
│   ├── auth.ts         # 無改修（requireSession 再利用）
│   ├── types.ts        # ★AuthedEnv / MemberEnv / IdempotentEnv
│   ├── event.ts        # ★requireEventMember(min)
│   └── idempotency.ts  # ★Idempotency-Key: zValidator("header") + c.set（RPC 型露出）
├── errors/index.ts     # ★DomainError/onError（ErrorCode/ErrorBody は @app/shared から import）
├── lib/{do.ts,ticket.ts,log.ts}   # ★callRoom / WS ticket / 構造化ログ
├── repo/{ids,events,members,schedule,counters}.ts  # ★Database 引数の純関数群
├── schemas/{events,members,schedule,counters,idempotency}.ts   # ★drizzle-zod 派生 + header
├── routes/{events,members,schedule,counters,timers,live,public}.ts + modules/ost.ts(Phase2)
└── durable/
    ├── protocol.ts     # ★api⇄DO 契約型（RoomCommand/RoomResult/RoomError、INTERNAL_*_PATH）
    ├── event-room.ts   # ★DurableObject 本体（ランタイム依存のみ）
    ├── timer-machine.ts# ★純関数: タイマー状態機械
    ├── counter-core.ts # ★純関数: カウンタ直列加算+冪等
    ├── snapshot.ts     # ★純関数: state→FullSnapshot / LiveMessage（wire 型は @app/shared）
    └── wal.ts          # WAL エントリ型 + D1 flush

apps/api/{wrangler.jsonc, vitest.config.ts, tsconfig.test.json, test/...}
```

責務の核: **`timer-machine.ts`/`counter-core.ts`/`snapshot.ts` は CF API 非依存の純関数**（`nowMs` を引数で受け、vitest で全分岐検証）。`event-room.ts` は「ランタイム時刻取得 → 純関数 → storage/D1 反映 → broadcast」の薄いオーケストレーション。

---

## 3. Hono API 層

### 3.1 Variables 型分離（`middleware/types.ts`）

既存 `middleware/auth.ts` の `AuthResult`/`AuthVariables`（`user`/`session` を `Auth["api"]["getSession"]` 戻り値由来でセット）と**同一構造**を保つ。

```ts
// apps/api/src/middleware/types.ts
import type { Bindings } from "../env";
import type { Auth } from "../auth";

type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

/** requireSession 済みサブルーター用（/events 直下） */
export type AuthedEnv = {
  Bindings: Bindings;
  Variables: { user: Session["user"]; session: Session["session"] };
};

/** requireEventMember を更に積むサブルーター用（/events/:eventId 配下） */
export type MemberEnv = {
  Bindings: Bindings;
  Variables: AuthedEnv["Variables"] & {
    member: { role: "owner" | "manager"; userId: string };
  };
};

/** counter/timer write 系（Idempotency-Key 必須）用 */
export type IdempotentEnv = {
  Bindings: Bindings;
  Variables: MemberEnv["Variables"] & { idempotencyKey: string };
};
```

### 3.2 env.ts 追記（1 行）

```ts
// apps/api/src/env.ts の Bindings に追記（EnvSchema は無改修：DO/D1 は zod 検証対象外）
export type Bindings = {
  // ...既存（GOOGLE_*/BETTER_AUTH_*/WEB_ORIGIN/COOKIE_DOMAIN/DB）...
  DB: D1Database;
  EVENT_ROOM: DurableObjectNamespace<import("./durable/event-room").EventRoom>; // ★追加
};
```

> WS ticket 署名鍵を導入する場合のみ `EnvSchema` に `WS_TICKET_SECRET: z.string().min(32)` を足し、`validateEnv` で起動時 fail-fast（§6.3 secret）。`EnvSchema` は無改修が基本（DO binding は zod 検証しない）。

### 3.3 index.ts（単一 app チェーン・onError・DO export・CORS）

既存 `index.ts` は `allowHeaders:["Content-Type","Authorization"]` で `/health`・`/auth/*` のみ。これに `Idempotency-Key` を追加し（**prod クロスサブドメインでカスタムヘッダ＝preflight 必須**）、`maxAge` で preflight をキャッシュ、`.route()` と `onError`・DO export を足す。

```ts
// apps/api/src/index.ts
import "temporal-polyfill/global";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { getAuth } from "./auth";
import type { Bindings } from "./env";
import { healthRoutes } from "./routes/health";   // 既存
import { eventRoutes } from "./routes/events";
import { publicRoutes } from "./routes/public";
import { onError } from "./errors";

const app = new Hono<{ Bindings: Bindings }>()
  .basePath("/api")
  .use(secureHeaders())
  .use((c, next) =>
    cors({
      origin: c.env.WEB_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"], // ★追加（write の preflight）
      maxAge: 86400, // ★preflight キャッシュ。モバイル回線の write 毎 OPTIONS 往復を抑制
    })(c, next),
  )
  .route("/health", healthRoutes)
  .on(["GET", "POST"], "/auth/*", (c) => getAuth(c.env).handler(c.req.raw))
  .route("/events", eventRoutes)   // requireSession を内部適用（AuthedEnv）
  .route("/public", publicRoutes); // 認可なし read-only projection

app.onError(onError);

export type AppType = typeof app;
export default app;
export { EventRoom } from "./durable/event-room"; // ★DO クラスを main から export
```

**チェーン途切れ禁止**: `AppType = typeof app` は `.route()/.on()` を連結したチェーン型から推論される。文に分けて代入すると RPC 推論が壊れる。サブルーターも `new Hono<Env>().get(...).post(...)` を一息で書いて変数に束ねる。`types.ts` は無改修で `@app/api/types` 経路を維持。

> **FE 注意（contract）**: `Idempotency-Key` はカスタムヘッダのため prod（api サブドメイン直叩き）では必ず preflight が発生する。`maxAge` でキャッシュするが、write の体感遅延が初回 preflight 由来になり得る点を FE パフォーマンス節に記載すること。

### 3.4 統一エラー — code/ErrorBody は `@app/shared` 単一ソース

`ErrorCode`/`ErrorBody` を `@app/shared` に置き、BE と FE が同一型を import する。FE `ApiError.code` を `ErrorCode` 型にすることで、`code` ベースの UX 分岐（保留破棄、`isConflict`）が文字列リテラル drift なく型で守られる。

```ts
// packages/shared/src/index.ts（追記・単一ソース）
export const ErrorCodeValues =
  ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "INTERNAL"] as const;
export type ErrorCode = (typeof ErrorCodeValues)[number];
export interface ErrorBody { error: string; code: ErrorCode }
```

```ts
// apps/api/src/errors/index.ts
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { type ErrorCode, type ErrorBody } from "@app/shared"; // ★import（重複定義しない）

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 500> = {
  BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, INTERNAL: 500,
};
export const statusForCode = (c: ErrorCode) => STATUS[c]; // DO 側 §5.9 でも再利用

export class DomainError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); }
  toBody(): ErrorBody { return { error: this.message, code: this.code }; }
  get status() { return STATUS[this.code]; }
}

export const onError = (err: Error, c: Context): Response => {
  if (err instanceof DomainError) return c.json(err.toBody(), err.status);
  if (err instanceof HTTPException) {
    const code: ErrorCode =
      err.status === 400 ? "BAD_REQUEST" : err.status === 401 ? "UNAUTHORIZED" : "INTERNAL";
    return c.json({ error: err.message, code } satisfies ErrorBody, err.status as 400 | 401 | 500);
  }
  console.error(JSON.stringify({ level: "error", event: "unhandled", msg: err.message, stack: err.stack }));
  return c.json({ error: "internal error", code: "INTERNAL" } satisfies ErrorBody, 500);
};
```

```ts
// apps/web/src/lib/api-error.ts（FE 側・共有 code に紐付け）
import type { ErrorCode, ErrorBody } from "@app/shared";
export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public status: number) { super(message); }
}
export const isConflict = (e: unknown): e is ApiError => e instanceof ApiError && e.code === "CONFLICT";
// RPC は成功系を型で受け、エラーは res.ok 判定後 (await res.json()) as ErrorBody で code 判別
```

DomainError を投げる主体: `requireEventMember`（`FORBIDDEN`/`NOT_FOUND`）、repo の owner 原子操作（`CONFLICT`）、`callRoom` が DO エラー（二重 start/不正遷移=`CONFLICT`）を再構築して throw。FE の `isConflict` 判定（§5.4 保留破棄 UX）は共有 `ErrorCode` に紐付く。

### 3.5 認可・冪等ミドルウェア

`requireEventMember` は `getMembership`（**active 絞り込み済み**・§4.3）を使い、DomainError を throw（onError が正規化）。

```ts
// apps/api/src/middleware/event.ts
import { createMiddleware } from "hono/factory";
import type { MemberEnv } from "./types";
import { getMembership } from "../repo/members";
import { DomainError } from "../errors";

export const requireEventMember = (min: "manager" | "owner" = "manager") =>
  createMiddleware<MemberEnv>(async (c, next) => {
    const eventId = c.req.param("eventId");
    if (!eventId) throw new DomainError("NOT_FOUND", "event not found");
    const member = await getMembership(c.env.DB, eventId, c.var.user.id); // ★active 行のみ1クエリ
    if (!member) throw new DomainError("FORBIDDEN", "not a member");
    if (min === "owner" && member.role !== "owner") throw new DomainError("FORBIDDEN", "owner only");
    c.set("member", { role: member.role, userId: c.var.user.id });
    await next();
  });
```

**Idempotency-Key を RPC 型に露出**（FE 付与漏れをコンパイルエラー化）。`zValidator("header")` で型に出し、かつ `c.set` で後段に渡す。

```ts
// apps/api/src/schemas/idempotency.ts
import { z } from "zod";
// hono のヘッダは小文字正規化される。RPC の header 型もこのキーで現れる
export const idempotencyHeaderSchema = z.object({
  "idempotency-key": z.string().regex(/^[A-Za-z0-9._-]{8,128}$/),
});
```

```ts
// apps/api/src/middleware/idempotency.ts
import { every } from "hono/combine";
import { zValidator } from "@hono/zod-validator";
import { createMiddleware } from "hono/factory";
import type { IdempotentEnv } from "./types";
import { idempotencyHeaderSchema } from "../schemas/idempotency";

// zValidator("header") で RPC 型に必須ヘッダを露出 → FE の付与漏れが型エラーになる。
// 検証後に c.var(valid header) を idempotencyKey へ移送（後段 handler は c.var.idempotencyKey を読む）。
export const requireIdempotencyKey = every(
  zValidator("header", idempotencyHeaderSchema),
  createMiddleware<IdempotentEnv>(async (c, next) => {
    c.set("idempotencyKey", c.req.valid("header")["idempotency-key"]);
    await next();
  }),
);
// 冪等の実適用は DO（メモリ直近N + storage 永続 + D1 unique の三段、§5.6）
```

> **FE 規約（contract）**: timer/counter の write 全 mutation hook（`useTimerOps`/`useAdjustCounter`/`useResetCounter`）は `$post({ header: idempotencyHeader() })` を**必須付与**。`zValidator("header")` により未付与は RPC 呼出が型エラーになる。FE 共通ラッパで write 系に自動付与する実装を推奨。

### 3.6 サブルーター構成（型分離・最小権限・owner 判定の正規化）

DELETE event の owner 判定は壊れたスケルトン（`throw c.get`）を撤去し、**owner 限定操作は専用サブルーターに `requireEventMember("owner")` を積む方式に一本化**する（ハンドラ内 role 判定との二重化を解消）。

```ts
// apps/api/src/routes/events.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireSession } from "../middleware/auth";
import { requireEventMember } from "../middleware/event";
import type { AuthedEnv, MemberEnv } from "../middleware/types";
import { createEventSchema, patchEventSchema } from "../schemas/events";
import * as eventsRepo from "../repo/events";
import { memberRoutes } from "./members";
import { scheduleRoutes } from "./schedule";
import { counterRoutes } from "./counters";
import { liveRoutes } from "./live"; // /live, /ws, /ws-ticket

// owner 限定操作だけを束ねる専用サブルーター（最小権限を route で表現）
const ownerScoped = new Hono<MemberEnv>()
  .use(requireEventMember("owner"))
  .delete("/", async (c) => {
    await eventsRepo.archiveEvent(c.env.DB, c.req.param("eventId")!); // status=archived（論理削除）
    return c.json({ ok: true } as const);
  });

// manager 以上で読める/書ける範囲
const eventScoped = new Hono<MemberEnv>()
  .use(requireEventMember("manager"))
  .get("/", async (c) => c.json(await eventsRepo.getEventDetail(c.env.DB, c.req.param("eventId")!)))
  .patch("/", zValidator("json", patchEventSchema), async (c) =>
    c.json(await eventsRepo.patchEvent(c.env.DB, c.req.param("eventId")!, c.req.valid("json"))))
  .route("/", ownerScoped)         // DELETE / は owner 専用
  .route("/members", memberRoutes)  // 変更系は内部で requireEventMember("owner")
  .route("/schedule", scheduleRoutes)
  .route("/counters", counterRoutes)
  .route("/", liveRoutes);

export const eventRoutes = new Hono<AuthedEnv>()
  .use(requireSession) // ★既存ミドルウェア再利用
  .get("/", async (c) => c.json(await eventsRepo.listEventsForUser(c.env.DB, c.var.user.id)))
  .post("/", zValidator("json", createEventSchema), async (c) =>
    c.json(await eventsRepo.createEventWithOwner(c.env.DB, c.var.user.id, c.req.valid("json")), 201))
  .route("/:eventId", eventScoped);
```

`MemberEnv extends AuthedEnv` により `c.var.user` の存在が型保証される。members 変更系（POST/PATCH/DELETE）は `memberRoutes` 内で `requireEventMember("owner")` を積み、最後の owner 保護は repo の原子 SQL（§4.3）の戻り `false` を `CONFLICT` に変換。

**Timer は schedule 配下にネストして両 param 継承**（design.md §4.2 のパスに厳密一致）:

```ts
// apps/api/src/routes/schedule.ts（要点・timer をマウント）
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireEventMember } from "../middleware/event";
import type { MemberEnv } from "../middleware/types";
import * as scheduleRepo from "../repo/schedule";
import { createScheduleItemSchema, patchScheduleItemSchema, reorderSchema } from "../schemas/schedule";
import { timerRoutes } from "./timers";

export const scheduleRoutes = new Hono<MemberEnv>()
  .use(requireEventMember("manager"))
  .get("/", async (c) => c.json(await scheduleRepo.listItems(c.env.DB, c.req.param("eventId")!)))
  .post("/", zValidator("json", createScheduleItemSchema), async (c) =>
    c.json(await scheduleRepo.createItem(c.env.DB, c.req.param("eventId")!, c.req.valid("json")), 201))
  .post("/reorder", zValidator("json", reorderSchema), async (c) =>
    c.json(await scheduleRepo.reorder(c.env.DB, c.req.param("eventId")!, c.req.valid("json").orderedItemIds)))
  .patch("/:itemId", zValidator("json", patchScheduleItemSchema), async (c) =>
    c.json(await scheduleRepo.patchItem(c.env.DB, c.req.param("itemId")!, c.req.valid("json"))))
  .delete("/:itemId", async (c) => { /* running 中は DO 判定で 409（callRoom 経由） */ })
  .route("/:itemId/timer", timerRoutes); // ★ /schedule/:itemId/timer/{start,...} を実現（design.md §4.2 一致）
```

```ts
// apps/api/src/routes/timers.ts（DO 委譲・判定は DO・Idempotency-Key は RPC 型に露出）
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireIdempotencyKey } from "../middleware/idempotency";
import type { IdempotentEnv } from "../middleware/types";
import { callRoom } from "../lib/do";

// scheduleRoutes に "/:itemId/timer" でマウントされるため :eventId/:itemId 両方を param 継承
export const timerRoutes = new Hono<IdempotentEnv>()
  .use(requireIdempotencyKey) // requireEventMember("manager") は親 scheduleRoutes で適用済み
  .post("/start", async (c) => {
    const r = await callRoom(c.env, c.req.param("eventId")!, {
      type: "timer.start", itemId: c.req.param("itemId")!,
      actorUserId: c.var.member.userId, idempotencyKey: c.var.idempotencyKey,
    });
    return c.json({ timer: r.payload, version: r.version }); // 二重 start は DO が CONFLICT→callRoom throw→onError 409
  })
  .post("/pause",    async (c) => c.json(await callTimer(c, "timer.pause")))
  .post("/resume",   async (c) => c.json(await callTimer(c, "timer.resume")))
  .post("/complete", async (c) => c.json(await callTimer(c, "timer.complete")))
  .post("/skip",     async (c) => c.json(await callTimer(c, "timer.skip")))
  .patch("/extend", zValidator("json", z.object({ deltaSec: z.number().int() })), async (c) => {
    const r = await callRoom(c.env, c.req.param("eventId")!, {
      type: "timer.extend", itemId: c.req.param("itemId")!, deltaSec: c.req.valid("json").deltaSec,
      actorUserId: c.var.member.userId, idempotencyKey: c.var.idempotencyKey,
    });
    return c.json({ timer: r.payload, version: r.version });
  });
// callTimer = 共通ヘルパ（type と param/idempotencyKey を束ねて callRoom→{timer,version} 整形）
```

> **FE 注意（contract）**: timer の RPC アクセサ経路は `client.api.events[":eventId"].schedule[":itemId"].timer.start.$post(...)`。FE `api-types.ts` に `InferRequestType`/`InferResponseType` を追加し、`useTimerOps` が同一アクセサと `idempotencyHeader()` を使うことを型で固定する。

```ts
// apps/api/src/routes/live.ts — WS ticket は query を保持 + x-ws-ticket ヘッダに移送（critical 修正）
import { Hono } from "hono";
import { requireEventMember } from "../middleware/event";
import type { MemberEnv } from "../middleware/types";
import { callRoom, eventRoomStub } from "../lib/do";
import { issueWsTicket } from "../lib/ticket";
import { INTERNAL_WS_PATH } from "../durable/protocol";

export const liveRoutes = new Hono<MemberEnv>()
  .use(requireEventMember("manager"))
  .get("/live", async (c) => {
    const r = await callRoom(c.env, c.req.param("eventId")!, { type: "snapshot.get" });
    return c.json(r.payload); // FullSnapshot（version + serverNowMs）
  })
  .post("/ws-ticket", async (c) => {
    const ticket = await issueWsTicket(c.env, {
      eventId: c.req.param("eventId")!, userId: c.var.member.userId, role: c.var.member.role,
    });
    return c.json({ ticket, expiresInSec: 60 });
  })
  .get("/ws", (c) => {
    if (c.req.header("Upgrade") !== "websocket")
      return c.json({ error: "expected websocket", code: "BAD_REQUEST" } as const, 400);
    const stub = eventRoomStub(c.env, c.req.param("eventId")!);
    const u = new URL(c.req.url);
    // ★critical 修正: 元 URL の search を保持して内部 URL を組み立て、さらに ticket を内部ヘッダへ移送。
    //   これで FE の `…/ws?ticket=…`（cookie 不達フォールバック）が DO まで確実に届く。
    const req = new Request(`https://room${INTERNAL_WS_PATH}${u.search}`, c.req.raw);
    req.headers.set("x-event-id", c.req.param("eventId")!);
    req.headers.set("x-conn-meta", JSON.stringify({ userId: c.var.member.userId, role: c.var.member.role }));
    const ticket = u.searchParams.get("ticket");
    if (ticket) req.headers.set("x-ws-ticket", ticket); // DO は x-ws-ticket（or x-conn-meta）で認可確定
    return stub.fetch(req);
  });
```

> **WS 認可媒体の確定（contract）**: FE は `wss://…/api/events/:eventId/ws?ticket=<t>`（cookie 不達時のフォールバック）で接続。api は (a) search を内部 URL に保持し、(b) `ticket` を `x-ws-ticket` ヘッダにも移送する。DO はハンドシェイク時に、まず `x-conn-meta`（api 側で member 認可済みのメタ）を採用し、cookie 不達経路では `x-ws-ticket` を署名検証して membership を確定する。FE/api/DO の三者で「query 送出 → api がヘッダ移送 → DO がヘッダ検証」を唯一の経路に固定。

### 3.7 入力スキーマ（`schemas/*` — drizzle-zod 派生）

```ts
// apps/api/src/schemas/events.ts
import { z } from "zod";
import { eventInsertSchema } from "@app/db/zod";

export const createEventSchema = eventInsertSchema
  .pick({ title: true, timezone: true, startsAtMs: true })
  .extend({
    title: z.string().min(1).max(120),
    timezone: z.string().min(1).default("Asia/Tokyo"),
    startsAtMs: z.number().int().positive().optional(),
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const patchEventSchema = eventInsertSchema
  .pick({ title: true, startsAtMs: true, publicSlug: true, externalUrl: true }).partial();
```

```ts
// apps/api/src/schemas/{schedule,counters}.ts（要点）
export const createScheduleItemSchema = scheduleItemInsertSchema
  .pick({ title: true, kind: true, plannedDurationSec: true, track: true, orderIndex: true, speaker: true, note: true })
  .extend({ title: z.string().min(1), plannedDurationSec: z.number().int().positive() })
  .partial({ kind: true, track: true, orderIndex: true, speaker: true, note: true });
export const patchScheduleItemSchema = createScheduleItemSchema.partial();
export const reorderSchema = z.object({ orderedItemIds: z.array(z.string()).min(1) });
export const adjustSchema = z.object({ delta: z.number().int().refine((n) => n !== 0) });
export const createCounterSchema = z.object({ name: z.string().min(1).max(40), capacity: z.number().int().positive().nullable().optional() });
// reset/adjust の Idempotency-Key は idempotencyHeaderSchema（§3.5）を header validator で適用。reset は body なし
```

zValidator の 400（json/header いずれも）は `app.onError` が `HTTPException` 経由で `{error, code:"BAD_REQUEST"}` に正規化する。

---

## 4. repo & 永続化層（Drizzle / D1）

### 4.1 enum 単一ソース（`@app/shared` 追記）

```ts
// packages/shared/src/index.ts 末尾に追記（既存 z import 再利用）
export const EventStatusValues = ["draft", "published", "live", "ended", "archived"] as const;
export const MemberRoleValues = ["owner", "manager"] as const;
export const MemberStatusValues = ["invited", "active", "revoked"] as const;
export const ScheduleKindValues = ["session", "break", "other"] as const;
export const ScheduleItemStatusValues = ["scheduled", "running", "paused", "done", "skipped"] as const;
export const AttendanceEventKindValues = ["adjust", "reset"] as const;
export const ModuleTypeValues = ["timetable", "attendance", "ost"] as const;

export const EventStatus = z.enum(EventStatusValues);
export const MemberRole = z.enum(MemberRoleValues);
export const ScheduleItemStatus = z.enum(ScheduleItemStatusValues);
export const ModuleType = z.enum(ModuleTypeValues);
// type も同名 export。ErrorCode/ErrorBody（§3.4）も同ファイルに置く（単一ソース）
```

### 4.2 Drizzle スキーマ完成形

design.md §2.2 を実ファイル化し、enum を shared 由来へ差し替えた版。index 命名規約: 単一/複合 `{table}_{cols}_idx`、unique `{table}_{cols}_uq`、すべて `(t) => [ ... ]` タプル形式。

```ts
// packages/db/src/schema/event.ts
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { EventStatusValues, MemberRoleValues, MemberStatusValues } from "@app/shared";
import { user } from "./auth";

export const event = sqliteTable("event", {
  id: text("id").primaryKey(),
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description"),
  publicSlug: text("public_slug").unique(),
  externalUrl: text("external_url"),
  startsAtMs: integer("starts_at_ms"),
  endsAtMs: integer("ends_at_ms"),
  timezone: text("timezone").notNull().default("Asia/Tokyo"),
  status: text("status", { enum: EventStatusValues }).notNull().default("draft"),
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
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  invitedEmail: text("invited_email"),
  role: text("role", { enum: MemberRoleValues }).notNull().default("manager"),
  status: text("status", { enum: MemberStatusValues }).notNull().default("invited"),
  invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
  invitedAt: integer("invited_at", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("event_member_event_user_uq").on(t.eventId, t.userId),
  uniqueIndex("event_member_event_invited_email_uq").on(t.eventId, t.invitedEmail)
    .where(sql`${t.userId} IS NULL AND ${t.invitedEmail} IS NOT NULL`),
  index("event_member_user_idx").on(t.userId),
  index("event_member_event_idx").on(t.eventId),
  // ★active 行を決定的に1件で引くため status を含む複合 index（getMembership 用、§4.3）
  index("event_member_event_user_status_idx").on(t.eventId, t.userId, t.status),
]);
```

`schedule.ts` / `attendance.ts` / `module.ts` は design.md §2.2 の定義そのまま（enum を `ScheduleKindValues`/`ScheduleItemStatusValues`/`AttendanceEventKindValues`/`ModuleTypeValues` に差し替え）。要点のみ再掲:

- `scheduleItem`: タイマー5列（`status` / `actualStartedAtMs` / `accumulatedPauseMs`(default 0) / `pausedAtMs` / `endedAtMs`）+ index `schedule_item_event_order_idx`・`schedule_item_event_status_idx`。
- `attendanceCounter`: `currentValue`(default 0) / `lastSeq`(default 0) + `attendance_counter_event_idx`。
- `attendanceEvent`: `seq` / `valueAfter` / `idempotencyKey` + `attendance_event_counter_seq_idx` + **`uniqueIndex("attendance_event_counter_idem_uq").on(counterId, idempotencyKey)`**（冪等最終防壁）。
- `eventModule`: `config: text({mode:"json"}).$type<Record<string, unknown>>()` + `uniqueIndex("event_module_uq").on(eventId, moduleType)`。

```ts
// packages/db/src/schema/index.ts に追記（既存 auth re-export はそのまま）
export { event, eventMember } from "./event";
export { scheduleItem } from "./schedule";
export { attendanceCounter, attendanceEvent } from "./attendance";
export { eventModule } from "./module";
```

`client.ts` は `import * as schema from "./schema/index"` で自動収集するため**無改修**。`zod.ts` に全テーブルの `createInsertSchema`/`createSelectSchema` を追記。

**relations() は MVP 不採用**（RQB でなく明示 join + `db.batch` で N+1 回避）。`$type` は `event_module.config` のみ。id にブランド型は付けない（drizzle insert 整合のため alias 止まり）。

### 4.3 repo パターン（Database 引数の純関数群・getMembership は active 絞り込み）

クラスにしない。第1引数は必ず `Database`、戻り型は drizzle 推論に任せ、呼出側が `Awaited<ReturnType<typeof fn>>` で引く。route は `createDb(c.env.DB)`、DO は `createDb(this.env.DB)` を渡す（同一 repo を両用、isolate 跨ぎでキャッシュ共有不可なので使い捨て生成）。

```ts
// apps/api/src/repo/ids.ts
export const newId = (): string => crypto.randomUUID(); // design.md §2.1 準拠
export const nowDate = (): Date => new Date();      // timestamp_ms 列用
export const nowMs = (): number => Date.now();      // *_at_ms 列用（素通し）
```

```ts
// apps/api/src/repo/members.ts
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@app/db";
import { eventMember } from "@app/db/schema";
import { nowDate } from "./ids";

// ★critical 修正: status='active' を WHERE に含めて active 行のみを決定的に引く。
//   (eventId,userId) が将来 revoked+再 invite で複数行になっても誤 403 を出さない。
export async function getMembership(db: Database, eventId: string, userId: string) {
  const rows = await db.select().from(eventMember)
    .where(and(
      eq(eventMember.eventId, eventId),
      eq(eventMember.userId, userId),
      eq(eventMember.status, "active"),
    )).limit(1);
  return rows[0] ?? null;
}
export async function listMembers(db: Database, eventId: string) {
  return db.select().from(eventMember).where(eq(eventMember.eventId, eventId));
}

// §4.4 最後の owner 保護：単一文 DELETE で原子化。影響 0 行 → route が CONFLICT(409)。
export async function deleteMemberAtomic(db: Database, eventId: string, userId: string): Promise<boolean> {
  const res = await db.delete(eventMember).where(sql`
    ${eventMember.eventId} = ${eventId} AND ${eventMember.userId} = ${userId}
    AND ${eventMember.status} = 'active'
    AND ( ${eventMember.role} <> 'owner'
       OR (SELECT count(*) FROM ${eventMember}
           WHERE ${eventMember.eventId} = ${eventId}
             AND ${eventMember.role} = 'owner' AND ${eventMember.status} = 'active') > 1 )
  `).returning({ id: eventMember.id });
  return res.length > 0; // false = 最後の owner だった
}

// owner→manager 降格も同型の条件付き UPDATE（owner が2人以上の時のみ）
export async function demoteOwnerAtomic(db: Database, eventId: string, userId: string): Promise<boolean> {
  const res = await db.update(eventMember).set({ role: "manager", updatedAt: nowDate() }).where(sql`
    ${eventMember.eventId} = ${eventId} AND ${eventMember.userId} = ${userId}
    AND ${eventMember.status} = 'active' AND ${eventMember.role} = 'owner'
    AND (SELECT count(*) FROM ${eventMember}
         WHERE ${eventMember.eventId} = ${eventId}
           AND ${eventMember.role} = 'owner' AND ${eventMember.status} = 'active') > 1
  `).returning({ id: eventMember.id });
  return res.length > 0;
}
```

> **運用補足（twin-row）**: 再 invite は revoked 行を再利用（status を invited→active へ UPDATE）するか revoked 行を物理削除してから INSERT し、`(eventId,userId)` の実質単一性を保つ運用を MVP で守る。`getMembership` の active 絞り込みと `event_member_event_user_status_idx` がこれを決定的にする。

members route は変更系を `requireEventMember("owner")` で表現し、戻り `false` を `DomainError("CONFLICT", "cannot remove the last owner")` に変換。

### 4.4 D1 のトランザクション / batch / クエリ最適化

**D1 は interactive transaction 不可**。2 文以上を不可分にしたい場面は `db.batch([...])`（単一トランザクション、全成功か全ロールバック）。単文の原子性で足りる場面（owner 保護）は単発 `.where(sql\`...\`)`。

```ts
// apps/api/src/repo/events.ts（作成 = batch で event + owner member + 既定モジュール + 既定 counter）
export async function createEventWithOwner(db: Database, ownerUserId: string, input: CreateEventInput) {
  const now = nowDate();
  const eventId = newId();
  await db.batch([
    db.insert(event).values({ id: eventId, createdByUserId: ownerUserId, title: input.title,
      timezone: input.timezone ?? "Asia/Tokyo", startsAtMs: input.startsAtMs ?? null,
      status: "draft", createdAt: now, updatedAt: now }),
    db.insert(eventMember).values({ id: newId(), eventId, userId: ownerUserId, role: "owner",
      status: "active", invitedByUserId: ownerUserId, invitedAt: now, acceptedAt: now, createdAt: now, updatedAt: now }),
    db.insert(eventModule).values({ id: newId(), eventId, moduleType: "timetable", enabled: true, orderIndex: 0, createdAt: now, updatedAt: now }),
    db.insert(eventModule).values({ id: newId(), eventId, moduleType: "attendance", enabled: true, orderIndex: 1, createdAt: now, updatedAt: now }),
    db.insert(attendanceCounter).values({ id: newId(), eventId, name: "main", currentValue: 0, lastSeq: 0, createdAt: now, updatedAt: now }),
  ]);
  return { eventId };
}

// 詳細 = batch で 5 本を 1 往復に束ねて N+1 回避（各クエリは既存 index を素直に使う）
export async function getEventDetail(db: Database, eventId: string) {
  const [meta, members, items, counters, modules] = await db.batch([
    db.select().from(event).where(eq(event.id, eventId)).limit(1),
    db.select().from(eventMember).where(eq(eventMember.eventId, eventId)),
    db.select().from(scheduleItem).where(eq(scheduleItem.eventId, eventId)).orderBy(scheduleItem.orderIndex),
    db.select().from(attendanceCounter).where(eq(attendanceCounter.eventId, eventId)),
    db.select().from(eventModule).where(eq(eventModule.eventId, eventId)).orderBy(eventModule.orderIndex),
  ]);
  if (!meta[0]) return null;
  return { event: meta[0], members, items, counters, modules };
}

// 一覧 = member 行を event_member_user_idx で引き event へ join（1 クエリ）
export async function listEventsForUser(db: Database, userId: string) {
  return db.select({ id: event.id, title: event.title, status: event.status,
      startsAtMs: event.startsAtMs, timezone: event.timezone, role: eventMember.role, updatedAt: event.updatedAt })
    .from(eventMember).innerJoin(event, eq(eventMember.eventId, event.id))
    .where(and(eq(eventMember.userId, userId), eq(eventMember.status, "active")))
    .orderBy(desc(event.startsAtMs));
}
```

カウンタ WAL flush の UPSERT（DO の alarm から呼ぶ。**batch は全成功/全失敗なので削除判定を単純化**）:

```ts
// apps/api/src/repo/counters.ts
export async function flushCounterWal(db: Database, entries: WalEntry[], nowMs: number) {
  if (entries.length === 0) return;
  await db.batch([
    db.insert(attendanceEvent).values(entries.map((e) => ({
      id: e.id, counterId: e.counterId, kind: e.kind, delta: e.delta, seq: e.seq,
      valueAfter: e.valueAfter, idempotencyKey: e.idempotencyKey,
      actedByUserId: e.actedByUserId, actedAtMs: e.actedAtMs, createdAt: new Date(nowMs),
    }))).onConflictDoNothing({ target: [attendanceEvent.counterId, attendanceEvent.idempotencyKey] }),
    // counter ごとに最終 entry で UPSERT。WAL は globalSeq 昇順なので lastPerCounter は最大 seq。
    // lastSeq < e.seq 条件で巻き戻り防止（再送で既に lastSeq>=seq なら no-op＝冪等）。
    ...lastPerCounter(entries).map((e) =>
      db.update(attendanceCounter)
        .set({ currentValue: e.valueAfter, lastSeq: e.seq, updatedAt: new Date(nowMs) })
        .where(sql`${attendanceCounter.id} = ${e.counterId} AND ${attendanceCounter.lastSeq} < ${e.seq}`)),
  ]);
}
```

> **WAL flush の削除規律（major 修正・明確化）**: D1 `batch` は**全成功か全ロールバック**。よって呼び出し側 DO は「`flushCounterWal` が解決（resolve）＝この回に積んだ全 entry を WAL から削除、reject＝全 entry 残置して次 alarm で再送」に単純化する。`onConflictDoNothing` は at-least-once 再送の正当動作（二重計上なし）であり、**削除可否の判定材料にしない**（D1 batch 結果から INSERT 件数と onConflict スキップ件数は区別できないため、件数で判定しない）。`lastPerCounter` の seq 単調前提（WAL は globalSeq 昇順 FIFO）を併記。

公開 projection（§3.6）は `event_public_slug_uq` で 1 行引き、`schedule_item_event_status_idx` で `status in (running,paused)` のみ select。member/counter 生値は出さない。

### 4.5 シリアライザ（`@app/shared` 追記・列名サフィックス強制）

```ts
// @app/shared
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};
export function serializeRow<T extends Record<string, unknown>>(row: T): Serialized<T> {
  const out: Record<string, unknown> = {};
  for (const k in row) {
    const v = row[k];
    out[k] = v instanceof Date ? dateToInstant(v).toString() : v; // *_at_ms(number) は素通し
  }
  return out as Serialized<T>;
}
```

`createdAt: Date → InstantString`、`startsAtMs: number → そのまま`。取り違えは `Serialized<T>` の型不一致でコンパイル検出。route の出力境界で適用。

### 4.6 マイグレーション運用

既存 `drizzle.config.ts`（`schema:./src/schema/index.ts`, `out:./migrations`, dialect sqlite）+ wrangler `migrations_dir:../../packages/db/migrations` が整合済み。フロー: `bun x drizzle-kit generate` → 生成 SQL レビュー（partial unique の `WHERE` / `onDelete` cascade·restrict·set null / enum CHECK）→ `wrangler d1 migrations apply DB --local` → `--remote`。**適用は必ず wrangler 経由**。migration SQL と `meta/_journal.json` はコミット対象。DO の `new_sqlite_classes:["EventRoom"]` は wrangler 側 migration で別系統（混同しない）。既存 Taskfile の `db:gen`/`db:migrate:local`/`db:migrate:prod` で充足。

---

## 5. EventRoom DO 実装

対象 `apps/api/src/durable/event-room.ts` ほか。`compatibility_date 2026-05-01` + `nodejs_compat`、`new_sqlite_classes:["EventRoom"]` 前提。`main` から `export { EventRoom }`。

### 5.1 内部 RPC 契約（`protocol.ts` — 単一ソース）

```ts
// apps/api/src/durable/protocol.ts
import type { TimerSnapshot, FullSnapshot, ErrorBody } from "@app/shared";

export const INTERNAL_COMMAND_PATH = "/__room/command";
export const INTERNAL_WS_PATH = "/__room/ws";

export type RoomCommand =
  | { type: "timer.start";    itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.pause";    itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.resume";   itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.complete"; itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.skip";     itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.extend";   itemId: string; deltaSec: number; actorUserId: string; idempotencyKey: string }
  | { type: "counter.adjust"; counterId: string; delta: number; actorUserId: string; idempotencyKey: string }
  | { type: "counter.reset";  counterId: string; actorUserId: string; idempotencyKey: string }
  | { type: "sync.schedule" } | { type: "sync.counters" } | { type: "snapshot.get" };

// 成功応答（command に対応）— REST 専用。WS broadcast には使わない（§5.7）。
export type RoomResult =
  | { ok: true; type: "snapshot"; version: number; serverNowMs: number; payload: FullSnapshot }
  | { ok: true; type: "timer";    version: number; serverNowMs: number; payload: TimerSnapshot }
  | { ok: true; type: "counter";  version: number; serverNowMs: number; payload: { counterId: string; value: number; seq: number } }
  | { ok: true; type: "ack";      version: number; serverNowMs: number };

// エラー応答（REST へ ErrorBody.code のまま伝播。HTTP status は §5.9 で code 由来）
export type RoomError = { ok: false } & ErrorBody;
export type RoomResponse = RoomResult | RoomError;
```

```ts
// apps/api/src/lib/do.ts
import type { Bindings } from "../env";
import { DomainError } from "../errors";
import { INTERNAL_COMMAND_PATH, type RoomCommand, type RoomResponse, type RoomResult } from "../durable/protocol";

export function eventRoomStub(env: Bindings, eventId: string) {
  return env.EVENT_ROOM.get(env.EVENT_ROOM.idFromName(eventId)); // §3.1 1イベント1DO
}

export async function callRoom(env: Bindings, eventId: string, cmd: RoomCommand): Promise<RoomResult> {
  const stub = eventRoomStub(env, eventId);
  const res = await stub.fetch(`https://room${INTERNAL_COMMAND_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-event-id": eventId },
    body: JSON.stringify(cmd),
  });
  const data = (await res.json()) as RoomResponse;
  if (!data.ok) throw new DomainError(data.code, data.error); // DO の CONFLICT/FORBIDDEN 等を REST へ伝播
  return data;
}
```

> `x-event-id`: `idFromName` は逆引き不可のため DO は自 eventId をヘッダで受け、初回に **eventId フィールドのみ**を確定保存する（version は触らない。§5.3）。

### 5.2 storage スキーマ（SQLite-backed KV）と一貫性ルール

KV API（`get`/`put`/`list`/`delete`、強整合・トランザクショナル）を主に使う。

| 論理 | キー | 値 |
|---|---|---|
| meta | `meta:room` | `{ eventId, version, restoredFromD1At }` |
| timer | `timer:<itemId>` | `RoomTimer`（TimerSnapshot + track + overrunNotified） |
| counter | `counter:<counterId>` | `CounterState`（value, seq, capacity, name） |
| WAL | `wal:<globalSeq16桁ゼロ詰め>` | `WalEntry`（FIFO=キー昇順） |
| idemp | `idemp:t:<key>` / `idemp:c:<key>` | `{ ... }` |

**一貫性ルール（broadcast したものは必ず永続化済み）**:
1. storage-first: in-memory を変える前に storage を書く。broadcast 前に書き込み完了。
2. timer write-through 原子順序: **storage → in-memory → D1 → version(meta) → broadcast**。
3. version は `meta:room` 永続後に確定してから broadcast。**eventId の確定は version とは独立**（§5.3）。
4. `blockConcurrencyWhile` 完了前は入力ゲートで競合なし。コマンド dispatch は restore 完了後にのみ受ける。

### 5.3 起動復元 + eventId 確定（version 非干渉）+ alarm 多重化

`constructor` で `ctx.blockConcurrencyWhile(() => this.restore())`。restore は meta/timers/counters/直近 idemp/WAL カーソルをロードし、WAL 残あれば flush alarm、running 中タイマーは overrun alarm を張り直す。**storage が一次ソース**: storage に timer/counter が 1 件もない初回起動時のみ D1 から hydrate（write-through 失敗で古い D1 値に巻き戻らない）。

**eventId 確定と version の責務分離（major 修正）**: `x-event-id` 受領時、eventId が未確定または不一致なら **eventId フィールドのみを書く専用メソッド `confirmEventId()`** を使う。`persistVersion()`（version を含む meta 書き込み）は**状態遷移時のみ**呼ぶ。これにより eventId 受領のたびに version=0/undefined を永続化して全クライアント再 snapshot を誘発する事故を防ぐ。restore 完了（blockConcurrencyWhile）後にのみコマンド dispatch を受ける順序を保証する。

```ts
// event-room.ts（要点）
private async confirmEventId(id: string): Promise<void> {
  if (this.eventId === id) return;
  this.eventId = id;
  const meta = (await this.ctx.storage.get<RoomMeta>("meta:room")) ?? { eventId: id, version: this.version };
  await this.ctx.storage.put("meta:room", { ...meta, eventId: id }); // ★version は触らない
}
private async persistVersion(): Promise<void> {
  const meta = (await this.ctx.storage.get<RoomMeta>("meta:room")) ?? { eventId: this.eventId, version: 0 };
  await this.ctx.storage.put("meta:room", { ...meta, version: this.version }); // 状態遷移時のみ
}
```

alarm は単一スロット。overrun 期限（`actualStartedAtMs + accumulatedPauseMs + plannedDurationSec*1000`、absolute なので hibernation/pause 跨ぎで正しい）と flush 期限（5 秒 debounce or N 件）を `reconcileAlarm()` が最小値へ畳み込み、`alarm()` で期限到来分を全消化（時刻比較で冪等、at-least-once でも二重作用しない: overrun は `overrunNotified`、flush は WAL 残量で防ぐ）。overrun は status を running のまま `overrunNotified` を立てて broadcast（自動 done しない）。

### 5.4 タイマー状態機械（`timer-machine.ts` 純関数 + DO 適用）

`nowMs` を引数で受け、`@app/shared` の `TimerSnapshot` union を入出力。不正遷移は `IllegalTransition`（→ DO が `CONFLICT` に変換）。

```ts
// apps/api/src/durable/timer-machine.ts（要点）
export class IllegalTransition extends Error { constructor(public code: string) { super(code); } }
export interface RoomTimer extends Extract<TimerSnapshot, { id: string }> { track: string; overrunNotified: boolean }

export function start(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status !== "scheduled") throw new IllegalTransition("timer_not_scheduled");
  return { ...t, status: "running", actualStartedAtMs: nowMs, accumulatedPauseMs: 0, pausedAtMs: null, endedAtMs: null };
}
export function pause(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status !== "running") throw new IllegalTransition("timer_not_running");
  return { ...t, status: "paused", pausedAtMs: nowMs };
}
export function resume(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status !== "paused") throw new IllegalTransition("timer_not_paused");
  return { ...t, status: "running", accumulatedPauseMs: t.accumulatedPauseMs + (nowMs - t.pausedAtMs!), pausedAtMs: null };
}
export function complete(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status !== "running" && t.status !== "paused") throw new IllegalTransition("timer_not_active");
  return { ...t, status: "done", pausedAtMs: null, endedAtMs: t.status === "paused" ? t.pausedAtMs! : nowMs };
}
export function skip(t: RoomTimer, nowMs: number): RoomTimer {
  if (t.status === "done" || t.status === "skipped") throw new IllegalTransition("timer_already_final");
  return { ...t, status: "skipped", pausedAtMs: null, endedAtMs: nowMs };
}
export function extend(t: RoomTimer, deltaSec: number): RoomTimer {
  if (t.status === "done" || t.status === "skipped") throw new IllegalTransition("timer_already_final");
  const next = t.plannedDurationSec + deltaSec;
  if (next < 0) throw new IllegalTransition("duration_negative");
  return { ...t, plannedDurationSec: next, overrunNotified: false };
}
```

DO 適用は §5.2 ルール 2 の順序。`timer.start` は全 timer を走査し「同 track に running があれば CONFLICT」（判定は DO 内）。冪等は §5.6。D1 write-through は `repo/schedule.ts` の `applyTimerTransition`（5 列 + status を 1 行 UPDATE、`*_at_ms`=number 素通し、`updatedAt`=`new Date()`）。

### 5.5 カウンタ直列化 + WAL（`counter-core.ts` 純関数 + DO 適用）

```ts
// apps/api/src/durable/counter-core.ts
export interface CounterState { value: number; seq: number; capacity: number | null; name: string }
export function applyAdjust(c: CounterState, delta: number) {
  const value = Math.max(0, c.value + delta);            // 下限0クランプ
  return { next: { ...c, value, seq: c.seq + 1 }, valueAfter: value };
}
export function applyReset(c: CounterState) {
  return { next: { ...c, value: 0, seq: c.seq + 1 }, prev: c.value }; // 読みと書きを DO 内で原子化
}
```

DO 受理順序（§5.2-1 厳守）: **WAL 永続 → counter ミラー永続 → 冪等記録 → version → broadcast**。reset は `applyReset` で `prev` 読みと `value=0` を不可分化（adjust の擬似 reset を使わない＝同時 +1 と競合しない）。flush は alarm で `repo/counters.flushCounterWal`（§4.4）を呼び、**resolve なら積んだ全 entry を WAL から削除、reject なら全残置で次 alarm 再送**（§4.4 の削除規律）。

### 5.6 冪等三段防壁

1. DO メモリ直近 N キー（`recentIdemp` Set、上限 1024、連打即時拒否）。
2. DO storage `idemp:t|c:<key>`（hibernation 跨ぎ再送拒否）。
3. D1 `attendance_event (counterId, idempotencyKey)` unique + `onConflictDoNothing`（WAL 再送の最終防壁）。

適用済みキー再送時は「現状を返す」（二重計上しない・同一結果）。

### 5.7 WebSocket Hibernation + snapshot（wire 型は `LiveMessage` のみ）

`/__room/ws` Upgrade を `ctx.acceptWebSocket(server, [\`user:${userId}\`])` で受理、`serializeAttachment({userId, role, joinedAtMs})`。認可は §3.6 の経路: `x-conn-meta`（api が member 認可済みで付与）を一次採用し、cookie 不達経路では `x-ws-ticket`（署名検証）で membership を確定。

**broadcast の wire 契約（major 修正）**: WS で送るのは **`@app/shared` の `LiveMessage` 型のみ**。REST 専用の `RoomResult` を WS に流用しない。とくに **`counter` variant は `serverNowMs` を含めない**（design.md §2.4 準拠、FE `clock.sync` は `snapshot`/`timer` のみ対象）。`snapshot.ts` の純関数が DO 状態から `LiveMessage`/`FullSnapshot` を構築する唯一の場所。

```ts
// snapshot.ts（要点・型は @app/shared）
export function counterMessage(version: number, c: CounterState, counterId: string): LiveMessage {
  return { kind: "counter", version, payload: { counterId, value: c.value, seq: c.seq } }; // ★serverNowMs なし
}
export function timerMessage(version: number, serverNowMs: number, t: TimerSnapshot): LiveMessage {
  return { kind: "timer", version, serverNowMs, payload: t };
}
```

> **FE 補足（minor）**: `LiveMessage.counter` は `capacity` を含まない（capacity は定義系＝D1 で WS では変わらない）。FE は capacity を `GET /live`（`qk.eventLive`/`qk.counters`）から取得し、LiveStore の counter 差分は value/seq のみ更新、capacity は Query 由来の別ソースを参照する。これにより snapshot 未着で counter 差分が先着しても定員超過警告が消えない。

接続直後に `buildSnapshotMessage()`（`kind:"snapshot"`）を送り presence broadcast。`webSocketMessage` は `ping`/`resync` のみ受理（**WS 経由の状態変更を許さない**）。`webSocketClose`/`webSocketError` は presence 再 broadcast。broadcast は `getWebSockets()` の OPEN 全件へ。全状態変更 broadcast で `version++ → persistVersion() → broadcast`（snapshot は version 進めない）。`buildFullSnapshot` が `ModuleSnapshot` discriminated union（`timetable`/`attendance`、新モジュールは 1 variant 追加で exhaustive 検査）で `FullSnapshot` を構築。

### 5.8 fetch ディスパッチ + wrangler

```ts
// apps/api/src/durable/event-room.ts（骨子）
export class EventRoom extends DurableObject<Bindings> {
  // eventId/version/timers/counters/recentIdemp/walGlobalSeq/flushDueMs ...
  constructor(ctx: DurableObjectState, env: Bindings) { super(ctx, env); ctx.blockConcurrencyWhile(() => this.restore()); }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const hdr = req.headers.get("x-event-id");
    if (hdr) await this.confirmEventId(hdr);                 // ★version 非干渉（§5.3）
    if (req.headers.get("upgrade") === "websocket" && url.pathname === INTERNAL_WS_PATH) return this.handleUpgrade(req);
    if (url.pathname === INTERNAL_COMMAND_PATH && req.method === "POST") {
      const cmd = (await req.json()) as RoomCommand;
      const result = await this.dispatch(cmd);               // RoomResponse
      const status = result.ok ? 200 : statusForCode(result.code); // ★code 由来 status（§5.9）
      return Response.json(result, { status });
    }
    return new Response("not found", { status: 404 });
  }
  // dispatch → applyTimer / applyCounter / syncSchedule / syncCounters / snapshotResult
}
```

```jsonc
// apps/api/wrangler.jsonc 追記（既存は compatibility_date 2026-05-01 + nodejs_compat のみ）
"durable_objects": { "bindings": [{ "name": "EVENT_ROOM", "class_name": "EventRoom" }] },
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["EventRoom"] }]
```

### 5.9 DO 応答の HTTP status（観測性確定・minor 修正）

DO の error 応答は **`code` 由来の HTTP status を返す**（`statusForCode(code)`＝`DomainError.status` 相当）。`callRoom` は一次判定に `body.ok` を使うが、DO が code に対応する status を返すことで CF ログの status 分布が観測可能になり、内部プロキシ層の挙動も一貫する。「200 固定でも可」の二択は撤去し、本方式に一意化する。`protocol.ts` のコメントもこれに合わせる。

---

## 6. テスト / CI / 運用

### 6.1 テスト層（責務に 1:1 対応）

| 層 | 対象 | ランナー |
|---|---|---|
| L1 純関数 | `@app/shared` の `elapsedMs`/`remainingMs`/`isOverrun`/`serializeRow`/`ErrorCode`、`timer-machine`/`counter-core`/`snapshot`（**counter LiveMessage に serverNowMs が無いこと**を含む）、`@app/db` zod | vitest（node） |
| L2 repo/D1 | `getMembership`（**active 絞り込み・twin-row 非決定性**）、owner 原子 SQL、`flushCounterWal` の unique/UPSERT/全成功削除 | @cloudflare/vitest-pool-workers（miniflare D1, isolatedStorage） |
| L3 DO | 状態機械・カウンタ直列化・WAL・alarm・hibernation 再構成・WS broadcast・**eventId 確定が version を進めないこと** | pool-workers（`runInDurableObject`/`runDurableObjectAlarm`/`SELF` WS） |
| L4 route | 認可(401/403)・validation・DO 委譲結線・**Idempotency-Key の header validator（未付与 400）**・**timer パスが `/schedule/:itemId/timer/*` で解決**・**ws ticket query→ヘッダ移送** | `app.request()` + pool-workers |

判定の網羅は L1+L3 に集中（design.md §3.2「REST は判定を持たない」）、L4 は薄く。

代表ケース: タイマー全遷移と不正遷移 409 / 同 track 二重 start 409 / resume の `accumulatedPauseMs` 加算 + `pausedAtMs=null` + D1 write-through / hibernation 復帰の 5 列再構成 / カウンタ 100 並行 +1 で lost update 無し / 同一 Idempotency-Key 二重送信 1 回計上 / reset 原子性 / alarm flush 後の `attendance_event` 1 行 + 再 flush で unique 防止 / flush 失敗→次 alarm 再送 / version 単調 broadcast / **eventId 受領 → version 不変** / `GET /live` FullSnapshot / **WS ?ticket= が x-ws-ticket で DO へ到達** / presence。Web 側 L1 は ServerClock（§6.5）による now 推定と §5.4 保留キュー突合（タイマー遷移破棄 / カウンタ delta 冪等再送）。

### 6.2 pool-workers 構成

`apps/api/package.json` に `@cloudflare/vitest-pool-workers ^0.9.0`（vitest `^3.0.0` 帯）。`vitest.config.ts` は `defineWorkersConfig` で wrangler.jsonc を単一ソースに読み、`readD1Migrations("../../packages/db/migrations")` を setup（`applyD1Migrations`）で適用、`durableObjects.EVENT_ROOM.useSQLite: true`、`isolatedStorage: true`。`tsconfig.test.json`（`types: ["@cloudflare/workers-types","@cloudflare/vitest-pool-workers"]`）を追加し `typecheck` を `tsgo --noEmit && tsgo --noEmit -p tsconfig.test.json` に拡張。`test` は `wrangler types && vitest run`。

### 6.3 CI（既存 ci.yml = Nix+Bun+Taskfile+Turbo 踏襲）

`task ci`（lint→typecheck→test→build）を維持。PR は `task ci:affected`（`turbo lint typecheck test build --affected`、`TURBO_SCM_BASE` に base sha、`actions/checkout fetch-depth:0`）。turbo の `dependsOn`（`^build`）が層順序（shared→db→api/web）を保証し、`@app/shared` 変更時（enum/ErrorCode/LiveMessage）は下流の test まで巻き込む。main push はフル `task ci`。Cloudflareの実リソース照合は本番deploy workflowの `task cloudflare:check` で行う。

### 6.4 運用 / デプロイ（既存 deploy.yml = workflow_run 連鎖踏襲）

順序 `ci → guard → cloudflare:check → migrate(D1) → {deploy-api, deploy-web} → verify` を維持。追加項目:
- **実リソース照合**: `task cloudflare:check` でD1名/UUID、API Worker Secrets、API/Web Worker versions、未適用migrationをread-only確認する。新規環境のD1作成だけ `task cloudflare:bootstrap` を使い、既存D1は自動削除しない。
- **DO migration tag**: クラス追加/リネーム/削除は必ず新 tag を追記（既存 tag を編集しない）。`new_sqlite_classes`/`renamed_classes`/`deleted_classes`。
- **secret**: `EnvSchema` の `GOOGLE_*`/`BETTER_AUTH_*` は `wrangler secret put`。`WS_TICKET_SECRET` を導入する場合も同様（`validateEnv` で fail-fast）。`WEB_ORIGIN`/`COOKIE_DOMAIN` は vars 平文。
- **migration 順序**: `migrate`（D1）→ `deploy-api`（needs）。列追加は nullable/default 付きの前向き migration。
- **ロールバック**: Worker は `wrangler rollback`。**DO クラス削除は巻き戻せない**ため段階適用（先に未使用化 deploy → 次 tag で削除）。緊急時はコードのみ rollback・DO クラス残置。
- **observability**: wrangler.jsonc の `observability.enabled:true`。`lib/log.ts` で構造化ログ 1 行 JSON。監視: WAL flush 失敗率 / 冪等弾き件数 / alarm 遅延 / WS 再接続率 / `GET /live` 再 snapshot 頻度 / **DO error の HTTP status 分布（§5.9）**。PII（email）は出さず `userId` まで。

### 6.5 FE 時刻同期の用語整合（minor 修正）

design.md §5.3 の `clientSkew = clientNow - serverNowMs`（端末時計差を保持しローカル interval で `remainingMs` 再計算）の**精緻化**として、FE は `performance.now()` アンカー方式の `ServerClock.serverNow()` を採用する（iOS の `Date.now()` ジャンプ耐性のため）。`remainingMs(snapshot, nowMs)` に渡す `nowMs` は**常に `clock.serverNow()` 由来（端末時計非依存のサーバー権威 now 推定）**であることを統一表現とする。`clock.sync(serverNowMs)` は `LiveMessage` の `snapshot`/`timer`（`serverNowMs` を持つ variant）と `GET /live` 応答でのみ呼ぶ。機能差はなく用語整合のみ。

---

## 7. バックエンド実装着手順序

design.md §8 を本書の粒度で具体化（依存順）。

0. **前提**: `task cloudflare:check` で設定とCloudflare実リソースを照合する。新規環境だけ `task cloudflare:bootstrap` でD1を作成する。
1. **`@app/shared`**: enum 値配列 + zod enum + `TimerSnapshot` union + `elapsedMs`/`remainingMs`/`isOverrun`（クランプ） + `LiveMessage`/`ModuleSnapshot`/`FullSnapshot` + **`ErrorCode`/`ErrorBody`（単一ソース）** + `Serialized<T>`/`serializeRow`。→ L1 着手可。
2. **`packages/db`**: `schema/{event,schedule,attendance,module}.ts`（`event_member_event_user_status_idx` 含む） → `schema/index.ts` 追記 → `zod.ts` 追記（`client.ts` 無改修）。
3. **migration**: `drizzle-kit generate` → 生成 SQL レビュー → `wrangler d1 migrations apply --local`。
4. **api 基盤**: `env.ts`（`EVENT_ROOM`） / `errors/index.ts`（shared から code import） / `middleware/types.ts` / `schemas/idempotency.ts`。
5. **repo**: `repo/{ids,events,members,schedule,counters}.ts`（`getMembership` active 絞り込み・owner 原子操作含む）。→ L2 テスト。
6. **schemas + middleware**: `schemas/*` / `middleware/{event,idempotency}.ts`（`requireSession` は既存再利用、idempotency は header validator）。
7. **REST 定義 CRUD**: `routes/{events,members,schedule}.ts` を chain で実装（DELETE event は owner 専用サブルーター、timer は `schedule/:itemId/timer` ネスト）、`index.ts` に `.route("/events", ...)`・`app.onError`・CORS（Idempotency-Key+maxAge）。型が `index.ts→types.ts→@app/api/types` を通ることを `tsgo --noEmit` で確認。→ L4 テスト。
8. **DO 契約 + 委譲**: `durable/protocol.ts` / `lib/{do,ticket,log}.ts`。
9. **EventRoom DO**: `durable/{timer-machine,counter-core,snapshot,wal}.ts`（純関数先行、counter LiveMessage に serverNowMs を入れない）→ `event-room.ts` 本体（Hibernation/storage/`confirmEventId`/alarm 多重化/write-through/WAL flush 全成功削除/冪等三段/§5.9 status）。`wrangler.jsonc` の `durable_objects`+`migrations`、`index.ts` の `export { EventRoom }`。→ L3 テスト。
10. **Live REST + WS**: `routes/{live,timers,counters}.ts`（DO 委譲、Idempotency-Key、判定は DO、`/ws` は query 保持 + `x-ws-ticket` 移送）。
11. **公開ページ（Phase2 冒頭）**: `routes/public.ts`（projection、§3.6 短ポーリング、管理者 DO 非相乗り）。
12. **モジュール拡張（Phase2）**: `routes/modules/ost.ts` + `.route()` 1 行、`ModuleSnapshot` に 1 variant。

主要新規ファイル（絶対パス）:
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/packages/db/src/schema/{event,schedule,attendance,module}.ts`、`seed.ts`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/api/src/errors/index.ts`、`middleware/{types,event,idempotency}.ts`、`repo/{ids,events,members,schedule,counters}.ts`、`schemas/{events,members,schedule,counters,idempotency}.ts`、`routes/{events,members,schedule,counters,timers,live,public}.ts`、`lib/{do,ticket,log}.ts`、`durable/{protocol,event-room,timer-machine,counter-core,snapshot,wal}.ts`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/api/{vitest.config.ts,tsconfig.test.json,test/helpers/{apply-migrations,env,ws}.ts}`

追記: `packages/shared/src/index.ts`（enum + ErrorCode/ErrorBody）、`packages/db/src/{schema/index.ts,zod.ts}`、`apps/api/src/{index.ts,env.ts}`、`apps/api/wrangler.jsonc`、`apps/api/package.json`

FE 側で連動修正が要る契約（本書で固定済み）: `apps/web/src/lib/api-error.ts`（`ErrorCode` import）、`api-types.ts`（timer の `InferRequestType/ResponseType` 追加・パスは `…schedule[":itemId"].timer.*`）、write 系 hook の `idempotencyHeader()` 必須付与、WS URL `…/ws?ticket=`、ServerClock を `clock.serverNow()` に統一。

無改修（確認済み）: `packages/db/src/client.ts`、`apps/api/src/{types.ts,auth.ts,middleware/auth.ts}`、`drizzle.config.ts`、既存 `db:gen`/`db:migrate:*` タスク
