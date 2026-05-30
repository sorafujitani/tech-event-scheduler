# tech-event-scheduler フロントエンド詳細設計書（最終版 / レビュー反映済み）

対象: `apps/web`（TanStack Start SSR Worker / React 19 / TanStack Router / Yamada UI 2）。本書は docs/design.md §5・§6 を実装着手粒度に詳細化し、ルーティング/データロード・リアルタイム/状態・UI/コンポーネント・API統合/テストの4観点を1本に統合した最終版。**docs/design.md の確定事項（DO中心、CQRS=操作REST/配信WS、loader は REST snapshot のみ・WS は client mount 後、`AppType` 間接層 `index.ts→types.ts→@app/api/types`、`*_at_ms`/`*At` 二系統、`requireSession` 既存再利用、SSR=service binding fetch / browser=オリジン直 fetch、5列タイマー再構成、WAL カウンタ+冪等三段、`ModuleSnapshot`/`LiveMessage` の exhaustive 描画、reset 専用 API）は不変。詳細化はするが決定は覆さない。**

本改訂で着手をブロックしていた契約欠陥（critical 2 / major 8 / 該当 minor）を以下のとおり潰した。**FE↔BE↔DO の契約媒体・パス・型ソースを一意に固定する**ことが本版の主眼である。

---

## 0. 本改訂で確定した FE↔BE 契約（着手前に固定する一覧）

| # | 論点 | 確定（FE 側の前提） | 対応する BE/DO 要件 |
|---|---|---|---|
| C1 | **WS ticket の受け渡し媒体** | ticket は **query param `?ticket=`** で渡す（§4.4・§6.1）。BE は GET `/ws` で **元 URL の `search` を保持**して内部 Request を組み立てること（`new URL(c.req.url).search` を内部 URL に連結）。FE はこの1媒体のみ前提とし `x-ws-ticket` ヘッダ方式は採らない。 | BE: `routes/live.ts` の GET `/ws` で元クエリ保持。DO: ハンドシェイクで `?ticket=` を検証。 |
| C2 | **Timer エンドポイントの method/path** | `POST /api/events/:eventId/schedule/:itemId/timer/{start,pause,resume,complete,skip}` と `PATCH /api/events/:eventId/schedule/:itemId/timer/extend`（design §4.2 厳密一致）。FE は `api-types.ts` に timer の `InferRequestType`/`InferResponseType` を定義し、`useTimerOps` が**同一 RPC アクセサ経路**を使う（§6.3・§6.5）。 | BE: `timerRoutes` を `scheduleRoutes` の `/:itemId/timer` 配下に `.route()` マウントし `:eventId`/`:itemId` 両 param を継承。 |
| M1 | **Idempotency-Key の型露出** | timer/counter の write 系 mutation **全てに** `header: idempotencyHeader()` を必須付与（§6.5）。BE は `zValidator("header", …)` で `Idempotency-Key` を RPC 型に露出させ、FE 付与漏れをコンパイルエラーにする。FE は加えて共通ラッパ `writeRpc()` で自動付与し二重防壁とする。 | BE: write 系に `zValidator("header", z.object({ "idempotency-key": z.string().uuid() }))`。`index.ts` CORS `allowHeaders` に `Idempotency-Key` 追加（現状未追加）。 |
| M2 | **ErrorBody/ErrorCode 単一ソース** | `@app/shared` に `ErrorBody`/`ErrorCode` を定義し、FE `api-error.ts` がそれを import。`ApiError.code: ErrorCode | undefined`、`isConflict` 等は共有 code に紐付け（§6.2）。 | BE: `errors/index.ts` も同 `@app/shared` を import（二重定義しない）。design §2.4 共有型列挙へ追記。 |
| M3 | **LiveMessage.counter は serverNowMs を持たない** | design §2.4 のとおり counter variant に `serverNowMs` 無し。FE `clock.sync` は `snapshot`/`timer` のみ対象（§4.4）。DO の WS broadcast は **`@app/shared` の `LiveMessage` のみを wire 契約**とし、REST 専用 `RoomResult` を流用しない。 | DO: counter broadcast に `serverNowMs` を混入させない。 |
| M4 | **SSR セッション確認は RPC を使わない** | better-auth は `/auth/*` ワイルドカードで RPC アクセサに出ないため、SSR は **素の fetch（service binding）で `/api/auth/get-session` を叩く**（§3.3・§3.4）。RPC アクセサ `apiClient.api.auth[...]` 記述は撤回。 | BE: better-auth の `get-session` が service binding 経由で叩ける（既存ハンドラで充足）。 |
| M5 | **LiveProvider は context.apiClient を使う** | resync の fetcher を loader と統一。`LiveProvider` は `Route.useRouteContext().apiClient` を受け取り、singleton `api()` 直 import を排除（§4.6）。 | — |
| M6 | **dev WS proxy** | `apps/web/vite.config.ts` の `/api` proxy に **`ws: true` 追加が必須**（未設定だと dev で WS Upgrade が全く転送されない実害ブロッカー）（§6.1・§8-1）。 | — |
| m1 | ServerClock は §5.3 `clientSkew` の精緻化 | `remainingMs(snapshot, nowMs)` の `nowMs` は常に `clock.serverNow()` 由来（端末時計非依存）。performance.now アンカー方式は design §5.3 clientSkew の実装精緻化であり方式変更ではない（§4.2）。 | — |
| m2 | Live タブの SSR hydration | Live ダッシュボードは **client-only 境界**または **SSR 時も親 snapshot から store を構築して LiveProvider を提供（socket だけ client mount）**。`useTimer` の `getServerSnapshot` は親 snapshot 由来の安定値を返す（§4.6）。 | — |
| m3 | wire 型の Date 不在不変条件 | `FullSnapshot`/`TimerSnapshot`/`ModuleSnapshot` は **wire 専用型で Date 列を持たない**（`*_at_ms`=number / ISO string のみ）。BE は `c.json(... satisfies FullSnapshot)` で構造一致をコンパイル突合（§6.3）。 | BE: GET `/live` 戻り型を `@app/shared` FullSnapshot 注釈。 |
| m4 | preflight キャッシュ | prod は api サブドメイン直叩き＝`Idempotency-Key` で必ず preflight。BE `cors({ maxAge })` で preflight キャッシュ。FE は write 体感遅延が preflight 由来になり得る点をパフォーマンス節に記載（§7.3）。 | BE: `cors` に `maxAge` 設定。 |

---

## 1. 全体方針

### 1.1 アーキ原則（4観点で合意した不変ルール）

1. **二層の真実の源を厳密に分離する。**
   - **スナップショット系（サーバー往復 = D1 read model / 初回 live snapshot）** = TanStack Query が保持。
   - **ライブ系（WS 差分の権威 = timer/counter/presence/version）** = `LiveStore`（`useSyncExternalStore` ベース外部ストア）が単独で保持。
   - 両者は **一方向（snapshot → store への初期注入）** のみ接続し、双方向同期しない。

2. **loader は REST snapshot のみ。WS は client mount 後に1回だけ確立**（design §5.1 critical）。

3. **mutation 無効化の境界**:
   - **定義/メタ系（WS で流れない: タイトル/メンバー/schedule 定義）= TanStack Query の楽観更新 + `invalidateQueries`**。
   - **ライブ系（WS で確定値が返る: timer/counter）= `LiveStore` の楽観オーバーレイ。Query/loader を一切無効化しない**（二重反映防止）。

4. **型は `@app/shared`（`TimerSnapshot`/`ModuleSnapshot`/`FullSnapshot`/`LiveMessage`/`ErrorBody`/`ErrorCode`/`elapsedMs`/`remainingMs`/enum）と `@app/api/types`（`AppType`）を唯一のソースにする。フロントで再定義しない。**

5. **環境分岐（prod/dev origin・WS URL）は単一モジュール `lib/env.ts` に集約**。api-client / auth-client / live socket / ws-ticket が全て参照。

### 1.2 採否を確定した技術判断（観点間の対立解消）

| 論点 | 決定 | 根拠 |
|---|---|---|
| **状態管理ライブラリ** | **zustand 不採用。`useSyncExternalStore` ベース自作 `LiveStore`** | version 順適用・ギャップ検知・購読粒度(timer/counter 単体)・タイマー非購読ローカル再計算というドメインロジックが本体で、zustand の利点が薄い。新規依存を増やさない（CLAUDE.md 依存最小方針）。 |
| **データフェッチ（スナップショット系）** | **TanStack Query を採用**（CRUD/一覧/詳細/初回 live snapshot/履歴のみ） | mutation 後の再フェッチ・楽観更新・タブ間キャッシュ共有・SSR dehydrate を標準化。loader 単独だと4タブが同一 `EventDetail` を重複フェッチする。 |
| **realtime を Query で賄うか** | **賄わない。`LiveStore` が単独権威** | WS 差分の version 管理・ギャップ再同期・skew 補正は Query のキャッシュモデルと相性が悪い。 |
| **責務境界** | WS が流す可能性のあるデータは Query で `staleTime: Infinity`（store が真実）。WS が流さない定義/メタは通常の Query 無効化フロー。 | 「楽観更新が WS broadcast と Query refetch で三重競合」を構造的に排除（design §5.4 整合表に対応）。 |
| **hc ラッパ** | throw 方式（`ApiError`）に正規化 + Query。Result が欲しい箇所（保留キュー再送）は `try/catch` | Query は throw 前提（`isError`/`retry`）。 |
| **write 系 RPC 呼び出し** | **`writeRpc()` 共通ラッパで `Idempotency-Key` 自動付与**（M1） | BE の `zValidator("header")` と二重防壁。付与漏れをコンパイル+実行時の両面で防ぐ。 |

### 1.3 追加依存（要 install）

- **deps**: `@tanstack/react-query`、QR ライブラリ（`qrcode` 等）。
- **devDeps**: `@testing-library/react`、`@testing-library/user-event`、`@testing-library/jest-dom`、`jsdom`、`msw`。（vitest は root 既存。）

---

## 2. ディレクトリ構成

`routes/` は薄く（ルート定義 + loader prefetch + feature 呼び出しのみ）、実体は `features/` に置く feature-based 構成。`lib/live/` にリアルタイム中核、`lib/` に環境/API 統合層、`modules/` に拡張レジストリ。

```
apps/web/src/
├── routes/                              # ルート定義のみ（薄い）。design §5.1 と一致
│   ├── __root.tsx                       # 改修: createRootRouteWithContext + theme/config + HeadContent/Scripts
│   ├── index.tsx                        # 改修: "/" → /events or /login redirect
│   ├── login.tsx                        # 改修: validateSearch {redirect?}
│   ├── _authed.tsx                      # 新規: beforeLoad セッションガード + AppShell
│   ├── _authed/
│   │   ├── events.tsx                   # 一覧コンテナ + FAB（loader なし）
│   │   ├── events.index.tsx             # "/events" 一覧 loader（prefetch）
│   │   ├── events.new.tsx               # 作成フォーム
│   │   ├── events.$eventId.tsx          # ★親 loader = REST snapshot 並列 prefetch + LiveProvider mount
│   │   ├── events.$eventId.index.tsx    # Live タブ（親 snapshot + LiveStore 消費）。client-only 境界(m2)
│   │   ├── events.$eventId.timetable.tsx
│   │   ├── events.$eventId.members.tsx
│   │   ├── events.$eventId.settings.tsx
│   │   └── events.$eventId.modules.$moduleType.tsx  # ★汎用モジュールルート
│   └── e.$slug.tsx                      # 公開ページ（Phase2・SSR・短ポーリング）
│
├── router.tsx                           # 改修: getRouter で context 構築 + QueryClient + register
├── router-context.ts                    # 新規: RouterContext 型
│
├── features/                            # 画面機能（縦割り）
│   ├── events-list/ { EventListPage.tsx, EventCreateDrawer.tsx }
│   ├── event-shell/ { EventDetailTabsShell.tsx }     # タブシェル。LiveProvider を mount
│   ├── live-dashboard/
│   │   ├── LiveDashboard.tsx
│   │   ├── TimerSection.tsx CounterSection.tsx ModuleCardGrid.tsx
│   ├── timetable/  members/  settings/
│
├── lib/
│   ├── env.ts                           # 新規: apiOrigin/authBaseURL/eventWsUrl/wsTicketUrl（唯一の origin ソース）
│   ├── api-client.ts                    # 改修: env.ts 参照 + onUnauthorized + singleton + writeRpc/idempotencyHeader
│   ├── auth-client.ts                   # 改修: 重複定数を env.ts の authBaseURL() に置換
│   ├── api-error.ts                     # 新規: ApiError(ErrorCode) + unwrap()
│   ├── api-types.ts                     # 新規: InferRequestType/InferResponseType ヘルパ（timer 含む）
│   ├── query.ts                         # 新規: makeQueryClient + qk(queryKey 規約)
│   ├── session.ts                       # 新規: createSessionResolver（SSR=素 fetch /browser=authClient）
│   ├── ssr-client.ts                    # 新規: SSR 専用 service binding fetch + Cookie 転送
│   ├── theme.ts                         # 新規: Yamada theme/config 拡張
│   ├── module-snapshot.ts               # 新規: ModuleSnapshot indexer + assertNeverModule
│   └── live/                            # ★リアルタイム中核
│       ├── store.ts                     # LiveStore（version 適用/ギャップ/購読粒度/楽観 overlay）
│       ├── socket.ts                    # LiveSocket（接続/backoff/heartbeat/ticket/visibility）
│       ├── clock.ts                     # ServerClock（performance.now アンカー skew・§5.3 精緻化）
│       ├── pending.ts                   # PendingQueue（楽観更新の保留キュー種別分け）
│       ├── ticket.ts                    # POST /ws-ticket フォールバック（context.apiClient 経由）
│       └── react/
│           ├── LiveProvider.tsx         # events.$eventId で1回 mount。store/socket/clock/pending を context
│           ├── hooks.ts                 # useLiveStore/useTimer/useCounter/usePresence/useConnectionState
│           └── useTimerTick.ts          # useRemainingMs（ローカル 1s interval・通信なし）
│
├── modules/                             # 拡張モジュールレジストリ（design §6）
│   ├── registry.ts registry.types.ts
│   ├── timetable/index.tsx attendance/index.tsx ost/index.tsx(Phase2)
│
├── components/                          # presentational（WS/API を知らない）
│   ├── shell/ { BottomTab.tsx, AppHeader.tsx, ConnectionChip.tsx, AppShell.tsx }
│   ├── timer/BigTimer.tsx counter/CounterControl.tsx
│   ├── feedback/ { RouteBoundaries.tsx, NotFound.tsx, Skeletons.tsx, OfflineOverlay.tsx, ConfirmUndo.tsx }
│   └── share/QRShare.tsx
│
├── hooks/                               # 横断 hook
│   ├── useIdempotencyKey.ts useNoticeUndo.ts useVisibilityResync.ts
│   └── mutations/ { useUpdateEvent.ts, useAdjustCounter.ts, useTimerOps.ts, useMembers.ts }
│
└── test/ { setup.ts, msw/{handlers.ts, server.ts} }  + *.test.{ts,tsx}
```

**配置原則**: `components/` は props だけで動く presentational（WS/API 非依存）。`features/` が API/WS/context を握り `components/` に流す。`modules/` は registry 経由でしか参照されない。

---

## 3. ルーティング & データロード（loader 層分離・認証ガード・context）

### 3.1 RouterContext と型付き router

route context には「**実行環境ごとに構築済みの `ApiClient`**」「**`QueryClient`**」「**セッション参照 `getSession`**」を載せる。

```ts
// apps/web/src/router-context.ts
import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "./lib/api-client";

export interface SessionContext { userId: string; email: string; name: string; }

export interface RouterContext {
  /** 実行環境(SSR Worker / browser)に合わせて構築済みの API クライアント */
  apiClient: ApiClient;
  /** SSR loader prefetch / mutation 無効化の対象 */
  queryClient: QueryClient;
  /** beforeLoad で解決。SSR=service binding 経由の素 fetch /browser=authClient.getSession(M4) */
  getSession: () => Promise<SessionContext | null>;
}
```

```ts
// apps/web/src/router.tsx
import "temporal-polyfill/global";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createApiClient, setupApiClient } from "./lib/api-client";
import { createSsrClientOptions } from "./lib/ssr-client";
import { createSessionResolver } from "./lib/session";
import { makeQueryClient } from "./lib/query";
import { authClient } from "./lib/auth-client";
import { RouteSpinner } from "./components/feedback/Skeletons";
import { RouteError } from "./components/feedback/RouteBoundaries";
import type { RouterContext } from "./router-context";

export const getRouter = () => {
  // SSR=service binding fetch(+Cookie 転送) / browser=オリジン直 fetch(credentials:"include")
  const apiClient = import.meta.env.SSR
    ? createApiClient(createSsrClientOptions())
    : createApiClient();
  const queryClient = makeQueryClient();

  const context: RouterContext = {
    apiClient,
    queryClient,
    getSession: createSessionResolver({ apiClient, ssr: import.meta.env.SSR }),
  };

  const router = createRouter({
    routeTree,
    context,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,        // 鮮度は §6 の Query 戦略に委ねる
    defaultPendingComponent: RouteSpinner,
    defaultErrorComponent: RouteError,
    scrollRestoration: true,
  });

  // 401 グローバル捕捉（browser のみ実体動作）。ログイン誘導は router 経由
  if (!import.meta.env.SSR) {
    setupApiClient(() => { void authClient.signOut(); void router.navigate({ to: "/login" }); });
  }
  return router;
};

declare module "@tanstack/react-router" {
  interface Register { router: ReturnType<typeof getRouter>; }
}
```

これで全 route の `context`/`loaderData`/`params`/`search` が型付き、loader 内の `apiClient.api.*` が `AppType`（`index.ts→types.ts→@app/api/types` 経路）でフル型推論される。

### 3.2 root（context 化 + theme + メタ）

`__root.tsx` を `createRootRouteWithContext<RouterContext>()` に差し替え、`UIProvider`/`ColorModeScript`（既存）を維持しつつ Yamada theme/config（§5.1）を注入、`HeadContent`/`Scripts` を追加。

```tsx
// apps/web/src/routes/__root.tsx
import { ColorModeScript } from "@yamada-ui/react/core";
import { UIProvider } from "@yamada-ui/react/providers/ui-provider";
import {
  createRootRouteWithContext, HeadContent, Outlet, Scripts,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { theme, config } from "../lib/theme";
import { AppErrorBoundary } from "../components/feedback/RouteBoundaries";
import { NotFound } from "../components/feedback/NotFound";
import type { RouterContext } from "../router-context";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      // viewport-fit=cover: Bottom Tab の env(safe-area-inset-bottom) を効かせる
      { name: "viewport", content: "width=device-width, initial-scale=1.0, viewport-fit=cover" },
      { title: "tech-event-scheduler" },
    ],
  }),
  component: RootComponent,
  errorComponent: AppErrorBoundary,
  notFoundComponent: NotFound,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <html lang="ja">
      <head><HeadContent /></head>
      <body>
        <ColorModeScript initialColorMode={config.initialColorMode} />
        <QueryClientProvider client={queryClient}>
          <UIProvider theme={theme} config={config}>
            <Outlet />
          </UIProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

### 3.3 SSR 専用クライアント（service binding + Cookie 転送）

```ts
// apps/web/src/lib/ssr-client.ts （SSR バンドル限定。browser へ混入させない）
import { env } from "cloudflare:workers";                 // @cloudflare/vite-plugin が ssr 環境で解決
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { ApiClientOptions } from "./api-client";

export const createSsrClientOptions = (): ApiClientOptions => ({
  origin: "https://api.internal",                          // service binding は intra-Worker。ダミー origin
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    // service binding fetch は自動で Cookie を運ばない → 受信リクエストの Cookie を明示転送
    const cookie = getRequestHeaders().get("cookie");
    if (cookie) headers.set("cookie", cookie);             // better-auth 認可を SSR でも通す
    return env.API.fetch(new Request(input as RequestInfo, { ...init, headers }));
  },
});
```

### 3.4 認証ガード（`_authed.tsx`）と SSR セッション確認（M4）

`beforeLoad` で `context.getSession()` を1回解決し子 context に確定 session を載せる。**SSR は better-auth ワイルドカードを RPC で叩けない**ため素の fetch で `/api/auth/get-session` を叩く（M4）。

```ts
// apps/web/src/lib/session.ts
import { authClient } from "./auth-client";
import type { ApiClient } from "./api-client";
import type { SessionContext } from "../router-context";

type GetSessionResponse = { user?: { id: string; email: string; name: string } } | null;

export const createSessionResolver =
  (deps: { apiClient: ApiClient; ssr: boolean }) =>
  async (): Promise<SessionContext | null> => {
    if (deps.ssr) {
      // M4: better-auth は /auth/* ワイルドカードで RPC アクセサに出ない。
      //     ApiClient が内部に保持する fetch(=service binding + Cookie 転送)を再利用し、
      //     better-auth の実パス /api/auth/get-session を素の fetch で叩く。
      const res = await deps.apiClient.$fetch("/api/auth/get-session", { method: "GET" });
      if (!res.ok) return null;
      const data = (await res.json()) as GetSessionResponse;
      return data?.user ? { userId: data.user.id, email: data.user.email, name: data.user.name } : null;
    }
    // browser: better-auth/react の軽量 session（Cookie 同梱）
    const { data } = await authClient.getSession();
    return data?.user ? { userId: data.user.id, email: data.user.email, name: data.user.name } : null;
  };
```

> `ApiClient.$fetch` は §6.2 で `createApiClient` が公開する「構築済み fetch（SSR=service binding+Cookie 転送 / browser=credentials:include）」への薄いアクセサ。RPC アクセサに無いパス（better-auth）を**同じ認可経路で**叩くために用意する。これにより SSR/ browser でセッション確認の fetcher が分岐しても認可媒体（Cookie）が一貫する。

```tsx
// apps/web/src/routes/_authed.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/shell/AppShell";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { session };                                   // 子 route の context に確定 session
  },
  component: () => (<AppShell><Outlet /></AppShell>),
});
```

`index.tsx` は `/events` or `/login` へ振り分け。`login.tsx` は `validateSearch: z.object({ redirect: z.string().optional() })`、`signIn.social({ provider:"google", callbackURL: Route.useSearch().redirect ?? "/" })`。

### 3.5 親 route loader = Query prefetch（REST snapshot のみ・WS 禁止）

`events.$eventId.tsx` の loader は **REST snapshot を Query に prefetch するだけ**。SSR は service binding fetch、browser は origin 直 fetch（context.apiClient に閉じ込めるので loader コードは環境非依存）。

```tsx
// apps/web/src/routes/_authed/events.$eventId.tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { qk } from "../../lib/query";
import { unwrap } from "../../lib/api-error";
import { EventDetailTabsShell } from "../../features/event-shell/EventDetailTabsShell";
import { EventDetailSkeleton } from "../../components/feedback/Skeletons";
import { EventDetailError } from "../../components/feedback/RouteBoundaries";

export const Route = createFileRoute("/_authed/events/$eventId")({
  loader: async ({ context, params }) => {
    const { apiClient, queryClient } = context;
    const eventId = params.eventId;
    // 並列: 詳細メタ + 初回 FullSnapshot。どちらも REST。WS は張らない（design §5.1）
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: qk.event(eventId),
        queryFn: async () => {
          const res = await apiClient.api.events[":eventId"].$get({ param: { eventId } });
          if (res.status === 404) throw notFound();
          return unwrap(res); // event + members + schedule_items + counters 定義 + enabled modules
        },
      }),
      queryClient.prefetchQuery({
        queryKey: qk.eventLive(eventId),
        staleTime: Infinity,  // 以後は LiveStore が権威。Query は再フェッチしない
        queryFn: () => unwrap(apiClient.api.events[":eventId"].live.$get({ param: { eventId } })),
      }),
    ]);
    return { eventId };
  },
  component: EventDetailTabsShell,     // タブシェル + LiveProvider（§4）
  pendingComponent: EventDetailSkeleton,
  errorComponent: EventDetailError,
});
```

子タブは **同じ `queryKey` を `useQuery`/`useSuspenseQuery` で共有**（再 fetch しない）。一覧 loader も同型（`qk.events()` を prefetch）。

### 3.6 ファイル対応表

| file | path | loader / 役割 |
|---|---|---|
| `_authed.tsx` | (pathless) | `beforeLoad` ガード + AppShell |
| `_authed/events.index.tsx` | `/events` | `qk.events()` prefetch（search フィルタ `{status?, q?}` を `loaderDeps`） |
| `_authed/events.new.tsx` | `/events/new` | 作成フォーム |
| `_authed/events.$eventId.tsx` | `/events/:eventId` | **REST snapshot 2本を並列 prefetch + LiveProvider mount** |
| `_authed/events.$eventId.index.tsx` | `/events/:eventId` | Live タブ。親 snapshot + LiveStore 消費。**client-only 境界(m2)** |
| `…timetable / members / settings` | — | 親 snapshot 消費 + mutation |
| `…modules.$moduleType.tsx` | `…/modules/:moduleType` | `parseParams: ModuleType.parse`、registry 動的描画、未知は `notFound()` |
| `e.$slug.tsx` | `/e/:slug` | 公開・未認証・SSR・短ポーリング（Phase2） |

### 3.7 search / params の型

- params: `$eventId`/`$slug` は素通し。`$moduleType` は `parseParams: ({moduleType}) => ({ moduleType: ModuleType.parse(moduleType) })`（不正は throw→`notFound()`）。
- search: `validateSearch` に Zod 4 を直接渡す。`/login`=`{redirect?}`、`/events`=`{status?: EventStatus, q?: string}`。
- pending/error/notFound: router 既定 + route 単位（一覧=`ListSkeleton`、詳細=`EventDetailSkeleton`、`pendingMs`/`pendingMinMs` でちらつき抑制）。401 は `_authed` ガードが先に弾くので route errorComponent は主に 403/500/network。

---

## 4. リアルタイムクライアント & 状態管理

`apps/web/src/lib/live/` に新設。Live タブから消費。SSR では socket を張らず、初回 snapshot を Query から受けて store を hydrate する（m2）。

### 4.1 全体データフロー

```
SSR loader (REST /live, service binding) ──prefetch──▶ Query cache qk.eventLive
                                                          │ LiveProvider mount(client)
                  ┌─── LiveSocket ──ws?ticket=──▶ EventRoom DO   (C1: ticket は query param)
                  │      (cookie→ticket, backoff, heartbeat, visibility/bfcache)
LiveStore ◀──applyMessage(LiveMessage by version)──┘
   │  gap? / bfcache復帰? ──▶ resync(): Query refetch qk.eventLive(context.apiClient) → applySnapshot
   ├─ useSyncExternalStore(subscribeTimer(id))   再描画: その timer の status 等が変わった時のみ
   ├─ useSyncExternalStore(subscribeCounter(id)) 再描画: その counter の value/seq が変わった時のみ
   └─ ServerClock(serverNowMs) ──useRemainingMs(1s interval)──▶ remainingMs() 再計算(通信なし)
PendingQueue ── 楽観 overlay / ack / 失敗ロールバック / 再接続後の突合 ──▶ store
```

### 4.2 ServerClock — サーバー権威時刻（design §5.3 clientSkew の精緻化・m1）

design §5.3 は `clientSkew = clientNow - serverNowMs` を保持しローカル interval で `remainingMs` を再計算する方式を規定する。本書はこれを **`performance.now()` アンカー方式**で実装精緻化する（iOS Safari の `Date.now()` ジャンプ・NTP 補正に強い）。**方式変更ではなく clientSkew の実装詳細化**であり、`remainingMs(snapshot, nowMs)` に渡す `nowMs` は常に `clock.serverNow()` 由来（端末時計非依存）という責務は design と同一。snapshot/timer 受信のたびに `sync()` で再補正する。

```ts
// apps/web/src/lib/live/clock.ts
export class ServerClock {
  private anchorPerf = 0; private anchorServerMs = 0; private hasAnchor = false;
  /** serverNowMs 受信のたびに再アンカー（= clientSkew の再補正に相当） */
  sync(serverNowMs: number): void {
    this.anchorPerf = performance.now(); this.anchorServerMs = serverNowMs; this.hasAnchor = true;
  }
  /** 端末時計非依存のサーバー now 推定。remainingMs の nowMs は常にこれを使う */
  serverNow(): number {
    if (!this.hasAnchor) return Date.now();
    return this.anchorServerMs + (performance.now() - this.anchorPerf);
  }
}
```

### 4.3 LiveStore — version 順適用・ギャップ検知・購読粒度（design §2.4 / §3.3）

```ts
// apps/web/src/lib/live/store.ts
import type { FullSnapshot, LiveMessage, TimerSnapshot } from "@app/shared";

export type CounterState = { counterId: string; value: number; seq: number; capacity: number | null };

export interface LiveState {
  version: number;
  serverNowMs: number;
  timers: ReadonlyMap<string, TimerSnapshot>;
  counters: ReadonlyMap<string, CounterState>;
  presence: number;
  lastResyncReason: "gap" | "visibility" | "reconnect" | null;
}
type Listener = () => void;

export class LiveStore {
  private state: LiveState;
  private globalListeners = new Set<Listener>();
  private timerListeners = new Map<string, Set<Listener>>();
  private counterListeners = new Map<string, Set<Listener>>();
  /** ギャップ検知時、socket に GET /live フル再取得を要求 */
  onResyncNeeded?: (reason: LiveState["lastResyncReason"]) => void;

  constructor(initial: FullSnapshot) { this.state = this.fromSnapshot(initial); }

  // 読み取り（useSyncExternalStore getSnapshot 群）。Map 内の同一参照を返し無関係カードの再描画を防ぐ
  getState = (): LiveState => this.state;
  getTimer = (id: string): TimerSnapshot | undefined => this.state.timers.get(id);
  getCounter = (id: string): CounterState | undefined => this.state.counters.get(id);
  getVersion = (): number => this.state.version;

  // 購読（粒度別）
  subscribeGlobal = (l: Listener) => this.add(this.globalListeners, l);
  subscribeTimer = (id: string, l: Listener) => this.add(this.mapSet(this.timerListeners, id), l);
  subscribeCounter = (id: string, l: Listener) => this.add(this.mapSet(this.counterListeners, id), l);

  /**
   * WS 1メッセージ受信。version 順厳守:
   *  msg.version === cur+1 → 差分適用 / <= cur → 冪等無視 / > cur+1 → ギャップ→resync 要求(差分破棄)
   *  snapshot は version を権威として置換（再同期の着地点）
   */
  applyMessage(msg: LiveMessage): void {
    if (msg.kind === "snapshot") { this.applySnapshot(msg.payload); return; }
    const cur = this.state.version;
    if (msg.version <= cur) return;
    if (msg.version !== cur + 1) { this.requestResync("gap"); return; }
    this.applyDelta(msg);
  }

  /** GET /live の結果で全置換（再同期の着地）。version は snapshot 値が権威 */
  applySnapshot(snap: FullSnapshot): void {
    const prev = this.state;
    this.state = this.fromSnapshot(snap);
    this.notifyDiff(prev, this.state);
  }

  private applyDelta(msg: Exclude<LiveMessage, { kind: "snapshot" }>): void {
    const next: LiveState = { ...this.state, version: msg.version };
    switch (msg.kind) {
      case "timer": {
        next.serverNowMs = msg.serverNowMs;          // timer は serverNowMs を持つ
        const timers = new Map(this.state.timers); timers.set(msg.payload.id, msg.payload);
        next.timers = timers; this.commit(next, { timerIds: [msg.payload.id] }); return;
      }
      case "counter": {
        // M3: counter variant に serverNowMs は無い。clock.sync 対象でもない。
        const counters = new Map(this.state.counters);
        const prev = counters.get(msg.payload.counterId);
        if (prev && msg.payload.seq <= prev.seq) {   // seq 後退は無視（順序保証の二重防壁）
          this.commit({ ...this.state, version: msg.version }, {}); return;
        }
        counters.set(msg.payload.counterId, {
          counterId: msg.payload.counterId, value: msg.payload.value,
          seq: msg.payload.seq, capacity: prev?.capacity ?? null,
        });
        next.counters = counters; this.commit(next, { counterIds: [msg.payload.counterId] }); return;
      }
      case "schedule": {
        next.timers = new Map(msg.payload.items.map((t) => [t.id, t]));
        this.commit(next, { global: true }); return;
      }
      case "presence": { next.presence = msg.payload.count; this.commit(next, { global: true }); return; }
      default: { const _x: never = msg; void _x; } // variant 追加でコンパイルエラー
    }
  }

  private requestResync(reason: LiveState["lastResyncReason"]): void {
    this.state = { ...this.state, lastResyncReason: reason };
    this.onResyncNeeded?.(reason);
  }
  // commit/notifyAll/notifyDiff/fromSnapshot/add/mapSet は粒度通知が要点（差分エンティティのみ新参照）
  // …（実装省略。変化した timer/counter の listener のみ通知）
  private fromSnapshot(s: FullSnapshot): LiveState {
    return {
      version: s.version, serverNowMs: s.serverNowMs,
      timers: new Map(s.timers.map((t) => [t.id, t])),
      counters: new Map(s.counters.map((c) => [c.counterId, { counterId: c.counterId, value: c.value, seq: c.seq, capacity: c.capacity }])),
      presence: s.presence.count, lastResyncReason: null,
    };
  }
  private add<T>(set: Set<T>, v: T) { set.add(v); return () => set.delete(v); }
  private mapSet<K, V>(m: Map<K, Set<V>>, k: K) { let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } return s; }
}
```

**要点**: ① `getTimer/getCounter` は Map 内の同一オブジェクト参照を返す → `useSyncExternalStore` の同値比較で無関係カードが再描画しない（購読単位＝timer/counter 単体）。② タイマーは status 遷移時のみ store 更新（残り時間の連続変化は §4.7 のローカル interval）。③ version は snapshot が権威・差分は +1 厳守、gap は差分破棄して `GET /live` 再取得、seq 後退は無視。④ **M3**: `clock.sync` は `snapshot`/`timer` のみ。counter は `serverNowMs` を wire に持たない（DO の broadcast 型も同一）。

### 4.4 LiveSocket — ライフサイクル / backoff / heartbeat / ticket / visibility（design §3.3 / §3.5 / §5.4）

```ts
// apps/web/src/lib/live/socket.ts
import { eventWsUrl } from "../env";
import { fetchWsTicket } from "./ticket";
import type { LiveStore } from "./store";
import type { ServerClock } from "./clock";
import type { PendingQueue } from "./pending";
import type { ApiClient } from "../api-client";
import type { LiveMessage } from "@app/shared";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

const HEARTBEAT_MS = 25_000;    // app層 ping（DO Hibernation の idle と両立）
const PONG_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

export class LiveSocket {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "connecting";
  private attempt = 0;
  private closedByUs = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListeners = new Set<(s: ConnectionState) => void>();

  constructor(
    private eventId: string,
    private store: LiveStore,
    private clock: ServerClock,
    private pending: PendingQueue,
    private resync: () => Promise<void>,            // Query refetch qk.eventLive(context.apiClient) → store.applySnapshot
    private apiClient: ApiClient,                   // M5: context の apiClient を受け取る（ticket 取得もこれ経由）
  ) {
    this.store.onResyncNeeded = () => void this.resync(); // ギャップ→全量取り直し
  }

  start(): void { this.closedByUs = false; this.bindVisibility(); void this.connect(); }
  stop(): void { this.closedByUs = true; this.unbindVisibility(); this.clearTimers(); this.ws?.close(1000, "client-stop"); this.ws = null; }
  subscribeState = (l: (s: ConnectionState) => void) => { this.stateListeners.add(l); return () => this.stateListeners.delete(l); };
  getStateValue = (): ConnectionState => this.state;

  // C1: cookie 第一 → close 1008/4401 観測で次回 ticket フォールバック。ticket は query param で接続。
  private async connect(useTicket = false): Promise<void> {
    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");
    let ticket: string | undefined;
    try { if (useTicket) ticket = await fetchWsTicket(this.eventId, this.apiClient); }
    catch { return this.scheduleReconnect(true); }
    const ws = new WebSocket(eventWsUrl(this.eventId, ticket)); // …/ws?ticket=… (C1)
    this.ws = ws;
    ws.onopen = () => this.onOpen();
    ws.onmessage = (e) => this.onMessage(e);
    ws.onclose = (e) => this.onClose(e);
  }

  private onOpen(): void {
    this.attempt = 0; this.setState("connected"); this.startHeartbeat();
    void this.resync();                       // 接続確立直後は必ず full snapshot（取りこぼし防止 §3.3）
    void this.pending.flushOnReconnect(this.store); // counter delta のみ自動再送
  }
  private onMessage(e: MessageEvent): void {
    if (typeof e.data === "string" && e.data === "pong") { this.notePong(); return; }
    let msg: LiveMessage; try { msg = JSON.parse(e.data as string) as LiveMessage; } catch { return; }
    // M3: serverNowMs を持つのは snapshot / timer のみ。counter は持たない → clock.sync しない
    if (msg.kind === "snapshot" || msg.kind === "timer") this.clock.sync(msg.serverNowMs);
    this.store.applyMessage(msg);
    this.pending.reconcileFromVersion(this.store.getVersion(), this.store);
  }
  private onClose(e: CloseEvent): void {
    this.clearTimers();
    if (this.closedByUs) { this.setState("offline"); return; }
    this.scheduleReconnect(e.code === 1008 || e.code === 4401); // 認可失敗は次回 ticket（C1）
  }
  private scheduleReconnect(useTicket = false): void {
    this.setState(navigator.onLine ? "reconnecting" : "offline");
    this.attempt += 1;
    const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    const delay = Math.random() * cap;        // full jitter
    this.reconnectTimer = setTimeout(() => {
      if (!navigator.onLine) { this.setState("offline"); return; } // online イベントで再開
      void this.connect(useTicket);
    }, delay);
  }
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send("ping");
      this.pongTimer = setTimeout(() => this.ws?.close(4000, "pong-timeout"), PONG_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }
  private notePong(): void { if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; } }

  // visibilitychange / pageshow(bfcache) / online（design §5.4 iOS Safari）
  private onVisible = (): void => {
    if (document.visibilityState !== "visible") return;
    // 復帰時は WS 状態に関わらず まず GET /live → skew 再補正 → 必要なら再接続
    void this.resync().then(() => { if (this.ws?.readyState !== WebSocket.OPEN) { this.attempt = 0; void this.connect(); } });
  };
  private onPageShow = (e: PageTransitionEvent): void => { if (e.persisted) this.onVisible(); };
  private onOnline = (): void => { this.attempt = 0; void this.connect(); };
  private bindVisibility(): void {
    document.addEventListener("visibilitychange", this.onVisible);
    globalThis.addEventListener("pageshow", this.onPageShow);
    globalThis.addEventListener("online", this.onOnline);
    globalThis.addEventListener("offline", () => this.setState("offline"));
  }
  private unbindVisibility(): void { /* 対応する removeEventListener */ }
  private setState(s: ConnectionState): void { if (s !== this.state) { this.state = s; this.stateListeners.forEach((l) => l(s)); } }
  private clearTimers(): void { /* heartbeat/pong/reconnect timer を全 clear */ }
}
```

```ts
// apps/web/src/lib/live/ticket.ts
import type { ApiClient } from "../api-client";
import { unwrap } from "../api-error";

// C1/M5: ticket 取得は context.apiClient の RPC アクセサ経由（401 は onUnauthorized へ）。
export const fetchWsTicket = async (eventId: string, apiClient: ApiClient): Promise<string> => {
  const res = await apiClient.api.events[":eventId"]["ws-ticket"].$post({ param: { eventId } });
  const data = await unwrap<{ ticket: string }>(res);
  return data.ticket;
};
```

**ライフサイクル要点**: cookie 第一・close `1008`/`4401` で次回 ticket フォールバック。**ticket は `eventWsUrl` が `?ticket=` query param に載せる（C1）。BE は GET `/ws` で元 URL の query を保持して DO へ渡すこと**（これが無いと ticket が DO に到達せず cookie 不達環境のフォールバックが原理的に成立しない）。接続成功＝即 `resync()`（WS は以降の差分のみ）。backoff はフルジッタ + `navigator.onLine` 連動。heartbeat は app 層テキスト `"ping"`/`"pong"`（DO Hibernation 維持）。bfcache 復帰は必ず再 snapshot → skew 再補正 → 再接続。**`resync()` は context の apiClient で `fetchQuery(qk.eventLive)` を叩き `store.applySnapshot` する（M5: loader と同一 fetcher）**。

### 4.5 PendingQueue — 楽観更新の保留キュー種別分け（design §5.4 / §4.4）

| 種別 | 性質 | 再接続時 | ack 確定 | 失敗 |
|---|---|---|---|---|
| カウンタ delta | 可換・冪等キー付き | **自動再送**（順序非依存） | broadcast の seq 到達で確定 | キュー保持→再送（ロールバックしない） |
| タイマー状態遷移 | 前提依存（status/version） | **自動再送しない**。最新と突合、前提崩れなら破棄→再操作促す | 期待 status の timer 到達で確定 | ロールバック + トースト（409=`isConflict` で前提崩れ確定） |

```ts
// apps/web/src/lib/live/pending.ts （骨子）
import type { LiveStore } from "./store";
import type { TimerSnapshot } from "@app/shared";

type CounterPending = { type: "counter"; idempotencyKey: string; counterId: string; delta: number; baseSeq: number };
type TimerPending = { type: "timer"; idempotencyKey: string; itemId: string; action: "start"|"pause"|"resume"|"complete"|"skip"; expectedFromStatus: TimerSnapshot["status"]; baseVersion: number };

export class PendingQueue {
  private items = new Map<string, CounterPending | TimerPending>();
  private optimisticCounter = new Map<string, number>();   // counterId → 楽観 delta 合計(overlay)
  private listeners = new Set<() => void>();
  onNeedReoperate?: (p: TimerPending) => void;             // UI: 再操作を促すトースト

  constructor(private eventId: string) {}
  subscribe = (l: () => void) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  private emit() { this.listeners.forEach((l) => l()); }

  /** UI 表示用: 確定値 + 保留 delta（楽観 overlay） */
  optimisticValue(counterId: string, confirmed: number): number {
    return Math.max(0, confirmed + (this.optimisticCounter.get(counterId) ?? 0));
  }
  isInFlight(key: string): boolean { return this.items.has(key); }

  // counter delta（可換・冪等）。失敗してもロールバックせずキュー保持
  applyOptimisticCounter(counterId: string, delta: number, baseSeq: number): string {
    const key = crypto.randomUUID();
    this.items.set(key, { type: "counter", idempotencyKey: key, counterId, delta, baseSeq });
    this.optimisticCounter.set(counterId, (this.optimisticCounter.get(counterId) ?? 0) + delta);
    this.emit(); return key;
  }
  rollbackOptimistic(key: string): void { /* counter overlay を減算 + items 削除 */ this.emit(); }

  // 再接続/再同期後の突合（design §5.4）
  reconcileFromVersion(currentVersion: number, store: LiveStore): void {
    for (const [key, p] of this.items) {
      if (p.type === "timer") {
        if (currentVersion <= p.baseVersion) continue;
        const cur = store.getTimer(p.itemId);
        if (!cur || cur.status !== p.expectedFromStatus) { this.items.delete(key); this.onNeedReoperate?.(p); }
      } else {
        const cur = store.getCounter(p.counterId);
        if (cur && cur.seq > p.baseSeq) {                  // seq が追いついたら overlay 相殺
          this.optimisticCounter.set(p.counterId, (this.optimisticCounter.get(p.counterId) ?? 0) - p.delta);
          this.items.delete(key);
        }
      }
    }
    this.emit();
  }
  async flushOnReconnect(store: LiveStore): Promise<void> { /* counter のみ再 POST。timer は再送しない */ }
}
```

> 実際の HTTP 送出（`POST .../counters/:counterId/adjust`・`POST .../schedule/:itemId/timer/start` 等）は §6 の mutation hook が `apiClient` の **`writeRpc()` 経由**で行い、`Idempotency-Key`（M1）を必ず付ける。`PendingQueue` は overlay と突合の状態機械を担い、送出は mutation と協調する。

### 4.6 LiveProvider と React バインディング（mount 後・購読粒度・M5・m2）

**M5**: `LiveProvider` は singleton `api()` を直 import せず `Route.useRouteContext().apiClient` を受け取り、resync の fetcher を loader と統一する。**m2**: SSR でも親 snapshot から store を構築して context を提供し、socket だけ client mount にする。これで Live タブが直リンク/リロードで SSR されても `useTimer` が例外を投げず hydration mismatch も起きない。

```tsx
// apps/web/src/lib/live/react/LiveProvider.tsx
import { createContext, useContext, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LiveStore } from "../store";
import { LiveSocket, type ConnectionState } from "../socket";
import { ServerClock } from "../clock";
import { PendingQueue } from "../pending";
import { qk } from "../../query";
import { unwrap } from "../../api-error";
import type { ApiClient } from "../../api-client";
import type { FullSnapshot } from "@app/shared";

type LiveContextValue = { store: LiveStore; socket: LiveSocket | null; clock: ServerClock; pending: PendingQueue };
const Ctx = createContext<LiveContextValue | null>(null);
export const useLiveContext = (): LiveContextValue => {
  const v = useContext(Ctx); if (!v) throw new Error("useLiveContext outside LiveProvider"); return v;
};

/**
 * events.$eventId.tsx で1回だけ mount。初期 snapshot は loader が prefetch 済み（design §5.1）。
 * m2: store/clock は SSR でも構築（socket だけ client mount）。useTimer の getServerSnapshot が安定値を返す。
 * M5: apiClient は context 由来を受け取り resync を loader と同一 fetcher に統一。
 */
export function LiveProvider(
  { eventId, apiClient, children }: { eventId: string; apiClient: ApiClient; children: React.ReactNode },
) {
  const qc = useQueryClient();
  const value = useMemo<LiveContextValue>(() => {
    const initial = qc.getQueryData<FullSnapshot>(qk.eventLive(eventId))!;
    const store = new LiveStore(initial);
    const clock = new ServerClock(); clock.sync(initial.serverNowMs);
    const pending = new PendingQueue(eventId);
    // socket は client mount 時にのみ生成（SSR では null）。store/clock/pending は SSR でも有効。
    return { store, socket: null, clock, pending };
  }, [eventId, qc]);

  // ★ WS はクライアント mount 後にだけ start（SSR では張らない design §3.5/§5.1）
  useEffect(() => {
    const { store, clock, pending } = value;
    const resync = async () => {
      const fresh = await qc.fetchQuery({
        queryKey: qk.eventLive(eventId), staleTime: 0,
        queryFn: () => unwrap<FullSnapshot>(apiClient.api.events[":eventId"].live.$get({ param: { eventId } })),
      });
      clock.sync(fresh.serverNowMs); store.applySnapshot(fresh);
      pending.reconcileFromVersion(fresh.version, store);
    };
    const socket = new LiveSocket(eventId, store, clock, pending, resync, apiClient);
    (value as { socket: LiveSocket | null }).socket = socket;
    socket.start();
    return () => socket.stop();
  }, [value, eventId, qc, apiClient]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

> `EventDetailTabsShell` が `LiveProvider eventId apiClient={Route.useRouteContext().apiClient}` で mount する。これで loader prefetch・resync・ticket 取得・401 経路がすべて単一 `apiClient` に統一される（M5）。

```ts
// apps/web/src/lib/live/react/hooks.ts
import { useCallback, useSyncExternalStore } from "react";
import { useLiveContext } from "./LiveProvider";
import type { ConnectionState } from "../socket";

export const useTimer = (id: string) => {
  const { store } = useLiveContext();
  return useSyncExternalStore(
    useCallback((cb) => store.subscribeTimer(id, cb), [store, id]),
    useCallback(() => store.getTimer(id), [store, id]),
    useCallback(() => store.getTimer(id), [store, id]), // m2: SSR getServerSnapshot は親 snapshot 由来の安定値
  );
};
export const useCounter = (id: string) => { /* subscribeCounter / getCounter で同型（SSR 安定値） */ };
export const usePresence = () => { /* subscribeGlobal / getState().presence */ };
export const useConnectionState = (): ConnectionState => {
  const { socket } = useLiveContext();
  // m2: socket は SSR で null。subscribe は no-op、getServerSnapshot は "connecting" 固定。
  return useSyncExternalStore(
    useCallback((cb) => socket?.subscribeState(cb) ?? (() => {}), [socket]),
    useCallback(() => socket?.getStateValue() ?? "connecting", [socket]),
    () => "connecting",
  );
};
```

### 4.7 タイマー描画 — ローカル interval で `remainingMs()`（design §5.3）

```ts
// apps/web/src/lib/live/react/useTimerTick.ts
import { useEffect, useState } from "react";
import { remainingMs, type TimerSnapshot } from "@app/shared";
import { useLiveContext } from "./LiveProvider";

/** running のみ 1s interval。通信なし・端末時計非依存（ServerClock.serverNow 基準・m1） */
export const useRemainingMs = (snapshot: TimerSnapshot | undefined): number | null => {
  const { clock } = useLiveContext();
  const isRunning = snapshot?.status === "running";
  const [, force] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning, snapshot?.id]);
  if (!snapshot) return null;
  return remainingMs(snapshot, clock.serverNow()); // m1: nowMs は常に clock.serverNow()
};
```

毎秒の再描画は `TimerCard` ローカルの `force` だけ（store も他カードも巻き込まない）。

---

## 5. UI / コンポーネント & モジュールレジストリ

Yamada UI 2 は scaffold 準拠の **サブパス個別 import**（`@yamada-ui/react/components/button`, `/core`, `/providers/*`, `/theme`）で統一。barrel import は使わない（tree-shake）。

### 5.1 Yamada テーマ拡張

```ts
// apps/web/src/lib/theme.ts
import { extendTheme, extendConfig } from "@yamada-ui/react/theme";

export const theme = extendTheme({
  semantics: {
    colors: {                                  // 屋外ハイコントラスト。色のみ依存を避け形/ラベル併用
      "live.on": "green.500", "live.warn": "yellow.500", "live.off": "gray.500",
      "timer.normal": "blackAlpha.900", "timer.soon": "orange.500", "timer.overrun": "red.500",
    },
  },
  tokens: {
    sizes: { tapMin: "48px", tapMain: "64px", tapCounter: "72px" }, // タップターゲット規約
    spaces: { safeBottom: "env(safe-area-inset-bottom)" },
  },
  styles: { globalStyle: { "*": { fontVariantNumeric: "tabular-nums" } } }, // 等幅数字
})({})[0]; // ※実シグネチャは Yamada 2 実 API に合わせ実装時確定

export const config = extendConfig({ initialColorMode: "system" }); // ColorMode 端末追従
```

`__root.tsx` の `<UIProvider theme={theme} config={config}>` と `<ColorModeScript initialColorMode={config.initialColorMode} />`（§3.2）に注入。`viewport-fit=cover` で safe-area 有効化。

### 5.2 モジュールレジストリ（design §6 の核心）

```ts
// apps/web/src/modules/registry.types.ts
import type { FC, ReactNode } from "react";
import type { ModuleType, ModuleSnapshot } from "@app/shared";

export type ModuleSnapshotOf<T extends ModuleType> = Extract<ModuleSnapshot, { moduleType: T }>;
export type ModuleLiveCardProps<T extends ModuleType> = { eventId: string; snapshot: ModuleSnapshotOf<T> | undefined };
export type ModulePageProps = { eventId: string };

export type EventModule<T extends ModuleType = ModuleType> = {
  moduleType: T;
  label: string;                 // アイコン+ラベル両表示（屋外誤認防止）
  icon: ReactNode;
  LiveCard?: FC<ModuleLiveCardProps<T>>;  // Live サマリーカード（任意）
  Page: FC<ModulePageProps>;              // タブ本体（必須）
  navOrder?: number;
};
```

```ts
// apps/web/src/modules/registry.ts
import type { ModuleType } from "@app/shared";
import type { EventModule } from "./registry.types";
import { timetableModule } from "./timetable";
import { attendanceModule } from "./attendance";
// import { ostModule } from "./ost"; // Phase2: 1行追加するだけ

// Record で「全 moduleType を網羅」を型で強制（enum 拡張時に登録漏れがコンパイルエラー）
export const moduleRegistry: Record<ModuleType, EventModule> = {
  timetable: timetableModule,
  attendance: attendanceModule,
  ost: ostModule,
};
export const getModule = (t: ModuleType): EventModule | undefined => moduleRegistry[t];

export type ActiveModule = { moduleType: ModuleType; orderIndex: number; module: EventModule };
export const resolveActiveModules = (
  enabled: { moduleType: ModuleType; orderIndex: number }[],
): ActiveModule[] =>
  enabled
    .map((e) => ({ ...e, module: moduleRegistry[e.moduleType] }))
    .filter((e): e is ActiveModule => e.module != null)         // DB に未知 moduleType があっても安全無視
    .sort((a, b) => (a.module.navOrder ?? a.orderIndex) - (b.module.navOrder ?? b.orderIndex));
```

> design §6 の `EventModule[]` 配列を `Record<ModuleType, EventModule>` に精緻化（決定の詳細化であり変更ではない）。網羅性を型で担保する。

汎用ルート（新ルートファイル追加不要・1枚で全モジュール Page を描画）:

```tsx
// apps/web/src/routes/_authed/events.$eventId.modules.$moduleType.tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { ModuleType } from "@app/shared";
import { getModule } from "../../modules/registry";

export const Route = createFileRoute("/_authed/events/$eventId/modules/$moduleType")({
  parseParams: ({ moduleType }) => ({ moduleType: ModuleType.parse(moduleType) }), // 不正→throw→notFound
  component: () => {
    const { eventId, moduleType } = Route.useParams();
    const mod = getModule(moduleType);
    if (!mod) throw notFound();
    const Page = mod.Page;
    return <Page eventId={eventId} />;
  },
  notFoundComponent: () => <ModuleNotFound />,
});
```

`ModuleSnapshot` exhaustive 描画:

```ts
// apps/web/src/lib/module-snapshot.ts
import type { ModuleSnapshot, ModuleType } from "@app/shared";
export const indexSnapshots = (snaps: ModuleSnapshot[]): Partial<Record<ModuleType, ModuleSnapshot>> => {
  const out: Partial<Record<ModuleType, ModuleSnapshot>> = {};
  for (const s of snaps) out[s.moduleType] = s;
  return out;
};
export const assertNeverModule = (s: never): never => { throw new Error(`Unhandled ModuleSnapshot: ${JSON.stringify(s)}`); };
```

```tsx
// apps/web/src/features/live-dashboard/ModuleCardGrid.tsx
import { SimpleGrid } from "@yamada-ui/react/components/grid";
import { resolveActiveModules } from "../../modules/registry";
import { indexSnapshots } from "../../lib/module-snapshot";
import type { ModuleSnapshotOf } from "../../modules/registry.types";

export function ModuleCardGrid({ eventId, enabledModules, moduleSnapshots }: Props) {
  const active = resolveActiveModules(enabledModules);
  const byType = indexSnapshots(moduleSnapshots);   // FullSnapshot.modules を index 化
  return (
    <SimpleGrid columns={2} gap="md">
      {active.map(({ moduleType, module }) => {
        const Card = module.LiveCard; if (!Card) return null;
        const snap = byType[moduleType] as ModuleSnapshotOf<typeof moduleType> | undefined;
        return <Card key={moduleType} eventId={eventId} snapshot={snap} />;
      })}
    </SimpleGrid>
  );
}
```

**新モジュール追加手順（確定）**: ① `@app/shared` の `ModuleType` enum と `ModuleSnapshot` union に1 variant 追加 → ② `modules/<type>/index.tsx` に `EventModule` 実装 → ③ `registry.ts` の `Record` に1エントリ（漏れは型エラー）→ ④ WS 受信側 switch に case 追加（`assertNeverModule` で漏れ検出）→ ルートファイル/タブ定義の追加は不要。

### 5.3 共通コンポーネント props（presentational）

```ts
// components/shell/BottomTab.tsx — 固定タブ + registry 由来モジュールタブの合成
export type TabItem = { key: string; label: string; icon: ReactNode; to: string; badge?: number };
export type BottomTabProps = { items: TabItem[]; activeKey: string };
// position="fixed" bottom={0}、pb="safeBottom"、各 minH="tapMin" 主要 boxSize="tapMain"。
// role="navigation" aria-label="主要ナビ"、active に aria-current="page"。

// components/shell/ConnectionChip.tsx
export type ConnectionChipProps = { state: ConnectionState; presenceCount?: number; onManualResync?: () => void };
// connected=緑●LIVE / reconnecting=黄⟳(Loading) / offline=灰。色+アイコン+テキスト併記。aria-live="polite"。

// components/timer/BigTimer.tsx
export type BigTimerProps = { snapshot: TimerSnapshot; nowMs: number }; // nowMs は useRemainingMs/ServerClock 供給
// remaining = remainingMs(snapshot, nowMs); overrun = remaining<0。
// color: overrun→timer.overrun / remaining<60_000→timer.soon / else timer.normal。
// fontSize="6xl" fontWeight="black" fontFamily="mono" tabularNums。overrun は "+MM:SS 超過"(⚠)。role="timer"。

// components/counter/CounterControl.tsx — ± delta 送信・楽観・seq マージ（絶対値 PUT 禁止）
export type CounterControlProps = {
  value: number;            // 確定値（DO broadcast）
  optimisticDelta: number;  // PendingQueue.optimisticValue 由来（表示 = value + delta）
  capacity?: number | null; pending?: boolean;
  onAdjust: (delta: number) => void; // 内部で Idempotency-Key 発番（M1: writeRpc 経由）
  onReset: () => void;               // reset 専用 API（adjust の -value 代用禁止 design §4.4）
  onHistory: () => void;
};
// ＋右 / −左（右手親指の弧）、IconButton rounded="full" boxSize="tapCounter"。中央 6xl mono。
// 超過は警告色+"定員超過"。navigator.vibrate(10)（"vibrate" in navigator ガード）。aria-label 必須。

// components/share/QRShare.tsx
export type QRShareProps = { publicUrl: string; title?: string }; // Card + QR + useClipboard、Drawer placement="bottom"
```

### 5.4 Live ダッシュボード構成（design §5.3）

```tsx
// features/live-dashboard/LiveDashboard.tsx
<VStack gap="lg" pb="safeBottom">
  <TimerSection />     {/* NOW + BigTimer + Progress(overrun colorScheme="red") + 一時停止/次へ/スキップ/+5分 + NEXT */}
  <Divider />
  <CounterSection />   {/* CounterControl + [+10][履歴][リセット]。楽観 delta と seq マージを保持 */}
  <Divider />
  <ModuleCardGrid />   {/* event_module を registry で動的描画（§5.2） */}
  <Accordion>          {/* ▸共有/QR(QRShare) ▸メンバー(n) */}
</VStack>
```

- `TimerSection`: `useTimer(itemId)`（status 遷移時のみ再描画）+ `useRemainingMs`（毎秒ローカル）。操作ボタン `tapMain`。「次へ ▶▶」は現在 done + 次 start を `ConfirmUndo`（5秒 Undo）でラップ。残り少/超過で `navigator.vibrate`。
- `CounterSection`: `useCounter(id)` の確定値 + `pending.optimisticValue` を `CounterControl` に流す。`onAdjust` は §6 の `useAdjustCounter`。
- **m2**: `LiveDashboard` は client-only 境界（`<ClientOnly>` 相当のマウント後描画）に置く。SSR では `EventDetailSkeleton` 等のプレースホルダを返し、store は LiveProvider が構築済みなので mount 後に即値が出る。

### 5.5 mobile first & a11y（実装規約）

- fixed bottom tab（`pb="safeBottom"`、コンテンツは tab 高 + safe-area 分の `pb` 確保）。片手操作（主要操作を下〜中央右、カウンタ ＋右/−左）。
- タップ領域: 最小 48px / 主要 64px / カウンタ 72px。
- aria: `BottomTab` `role="navigation"`/`aria-current`、`BigTimer` `role="timer"`、`ConnectionChip` `aria-live="polite"`、IconButton 全てに `aria-label`。
- 色のみ非依存: 接続状態/overrun/定員超過は色+アイコン+テキスト併記。`navigator.vibrate` はガード必須。

### 5.6 フォーム設計（Zod + Yamada / Drawer bottom）

入力スキーマは `@app/shared` の drizzle-zod 派生（`.pick()/.omit()/.extend()`、サーバー採番列は受けない）を**フロントでも import** し API と単一ソース。RHF は導入せず Yamada `FormControl` + ローカル state + `safeParse` の軽量パターン。

```tsx
// features/events-list/EventCreateDrawer.tsx
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from "@yamada-ui/react/components/drawer";
import { FormControl } from "@yamada-ui/react/components/form-control";
import { Input } from "@yamada-ui/react/components/input";
// placement="bottom"。onBlur/submit で schema.safeParse → 失敗時 FormControl isInvalid + ErrorMessage
// (aria-invalid/aria-describedby)。submit 中ボタン loading・二重送信防止。成功で onClose + 一覧 invalidate。
```

- 編集/メンバー/schedule item 追加は Drawer placement="bottom"（FAB から）。
- 日時は `startsAtMs`（epoch ms `_at_ms` 系）に変換して送信（API 境界で素通し）、表示は `timezone` + Temporal で整形。
- schedule `orderIndex` は 1000刻み採番、MVP 並び替えは上下ボタン（ドラッグは Phase2）。

---

## 6. API 統合（hc ラッパ・データフェッチ戦略・型安全・認証）

### 6.1 環境分岐の単一ソース

```ts
// apps/web/src/lib/env.ts — 全 origin/URL 分岐の唯一ソース
const PROD_API_ORIGIN = "https://tech-event-scheduler-api.fujitanisora0414.workers.dev";
export const apiOrigin = (): string => (import.meta.env.PROD ? PROD_API_ORIGIN : "");
export const authBaseURL = (): string => `${apiOrigin()}/api/auth`;

/** C1/§3.5: WS は service binding を通せない。prod=api オリジン直 / dev=同一オリジン(vite proxy)。
 *  ticket は query param ?ticket= で渡す（BE は元 URL の search を保持して DO へ転送すること）。 */
export const eventWsUrl = (eventId: string, ticket?: string): string => {
  const base = import.meta.env.PROD
    ? PROD_API_ORIGIN.replace(/^http/, "ws")
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const q = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
  return `${base}/api/events/${encodeURIComponent(eventId)}/ws${q}`;
};
```

`api-client.ts` / `auth-client.ts` の重複 `PROD_API_ORIGIN` 定数を削除し env.ts を参照（`browserOrigin()`→`apiOrigin()`、auth `baseURL`→`authBaseURL()`）。

> **M6（dev WS proxy・必須改修・ブロッカー）**: `vite.config.ts` の `server.proxy["/api"]` は現状 `changeOrigin: false` のみで `ws: true` が無い。これが無いと dev で `ws://host/api/events/:id/ws` の Upgrade が `localhost:8788` へ**一切転送されず、dev で WS が全く動かない**。`server.proxy["/api"]` に `ws: true` を追記すること（着手順序 §8-1 で最初に潰す）。

```ts
// vite.config.ts（改修 diff・M6）
server: {
  port: 5173,
  proxy: {
    "/api": { target: "http://localhost:8788", changeOrigin: false, ws: true }, // ★ws:true 追加
  },
},
```

### 6.2 ApiError + unwrap + createApiClient 拡張 + writeRpc（M1・M2・M4 アクセサ）

```ts
// apps/web/src/lib/api-error.ts （M2: ErrorBody/ErrorCode は @app/shared 単一ソース）
import type { ErrorBody, ErrorCode } from "@app/shared";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode | undefined, message: string) {
    super(message); this.name = "ApiError";
  }
  get isUnauthorized() { return this.status === 401; }
  get isForbidden() { return this.status === 403; }
  // M2: 文字列リテラルでなく共有 ErrorCode に紐付け（drift をコンパイル検出）
  get isConflict() { return this.status === 409 || this.code === "CONFLICT"; } // タイマー二重 start・最後の owner 等
}
export async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: Partial<ErrorBody> = {};
  try { body = (await res.json()) as Partial<ErrorBody>; } catch { /* 非JSON */ }
  throw new ApiError(res.status, body.code, body.error ?? `HTTP ${res.status}`);
}
```

```ts
// apps/web/src/lib/api-client.ts（改修・既存 options 互換を維持）
import type { AppType } from "@app/api/types";
import { hc } from "hono/client";
import { apiOrigin } from "./env";

export type ApiClient = ReturnType<typeof hc<AppType>> & {
  /** M4: RPC アクセサに無いパス(better-auth /api/auth/*)を同一 fetch 経路で叩くための薄いアクセサ */
  $fetch: Fetcher;
};
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ApiClientOptions = { origin?: string; fetch?: Fetcher; onUnauthorized?: () => void };

const makeBrowserFetch = (onUnauthorized?: () => void): Fetcher => async (input, init) => {
  const res = await globalThis.fetch(input, { ...init, credentials: "include" });
  if (res.status === 401) onUnauthorized?.();   // 401 グローバル捕捉
  return res;
};

export const createApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const origin = options.origin ?? apiOrigin();
  const customFetch = options.fetch ?? makeBrowserFetch(options.onUnauthorized);
  const client = hc<AppType>(origin, { fetch: customFetch }) as ApiClient;
  // M4: SSR は origin 付き絶対 URL、browser は相対 /api/... を同じ fetch で叩く
  client.$fetch = (input, init) =>
    customFetch(typeof input === "string" && input.startsWith("/") ? `${origin}${input}` : input, init);
  return client;
};

// ブラウザ用シングルトン（mutation hook から使う。LiveProvider は context.apiClient を使う＝M5）。
let _client: ApiClient | null = null;
export const setupApiClient = (onUnauthorized: () => void): void => { _client = createApiClient({ onUnauthorized }); };
export const api = (): ApiClient => (_client ??= createApiClient());

// M1: Idempotency-Key を必ず付与する write 系ヘッダ。BE の zValidator("header") に対応。
export const idempotencyHeader = (): { "Idempotency-Key": string } => ({ "Idempotency-Key": crypto.randomUUID() });
```

> **`api()` singleton の用途縮小（M5）**: `api()` は mutation hook（§6.5）専用。`LiveProvider`/`resync`/`ticket` 取得は `context.apiClient` を使い、loader と fetcher を一致させる（401 onUnauthorized 経路の二重化を排除）。

### 6.3 型安全（RPC からの推論・timer 含む C2・m3）

```ts
// apps/web/src/lib/api-types.ts
import type { InferRequestType, InferResponseType } from "hono/client";
import type { api } from "./api-client";
import type { FullSnapshot } from "@app/shared";
type Client = ReturnType<typeof api>;

export type EventDetail = InferResponseType<Client["api"]["events"][":eventId"]["$get"], 200>;
export type FullSnapshotRes = InferResponseType<Client["api"]["events"][":eventId"]["live"]["$get"], 200>;
export type CreateEventInput = InferRequestType<Client["api"]["events"]["$post"]>["json"];
export type AdjustCounterInput = InferRequestType<Client["api"]["events"][":eventId"]["counters"][":counterId"]["adjust"]["$post"]>["json"];

// C2: timer 操作の RPC 型を明示定義（useTimerOps が同一アクセサ経路を使う）。
//     BE は timerRoutes を schedule の /:itemId/timer 配下にマウントし :eventId/:itemId を継承する。
type TimerStart = Client["api"]["events"][":eventId"]["schedule"][":itemId"]["timer"]["start"]["$post"];
export type TimerOpInput = InferRequestType<TimerStart>;        // { param:{eventId,itemId}, header:{...} }
export type TimerSnapshotRes = InferResponseType<TimerStart, 200>;
export type ExtendTimerInput =
  InferRequestType<Client["api"]["events"][":eventId"]["schedule"][":itemId"]["timer"]["extend"]["$patch"]>["json"];

// m3: wire 型(@app/shared FullSnapshot, Date 列なし)と RPC レスポンス型の構造一致をコンパイル突合
export const _assertFullSnapshotShape = (x: FullSnapshotRes): FullSnapshot => x; // 不一致なら型エラー
```

> **C2 の前提**: BE は `timerRoutes` を `scheduleRoutes` の `/:itemId/timer` 配下に `.route()` マウントし、`:eventId`/`:itemId` 両 param を継承させる。これで RPC アクセサが `events[":eventId"].schedule[":itemId"].timer.start.$post` として解決し、FE/BE のタイマー path が design §4.2（`/schedule/:itemId/timer/start`）に厳密一致する。
> **アクセサ解決の前提**: API 側が単一 `app` チェーンを維持すること（design §4.1 厳守。別 Hono を new しない）。`@app/shared` の `FullSnapshot`/`TimerSnapshot` を API の `c.json(... satisfies FullSnapshot)` 戻り型に使えば `FullSnapshotRes` は `@app/shared` 型と構造一致する（m3）。

### 6.4 データフェッチ戦略（QueryClient / queryKey）

```ts
// apps/web/src/lib/query.ts
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error";
export const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: {
      staleTime: 30_000,
      retry: (count, err) => (err instanceof ApiError && (err.status === 401 || err.status === 403) ? false : count < 2),
    }},
  });

export const qk = {
  events: () => ["events"] as const,
  event: (id: string) => ["events", id] as const,
  eventLive: (id: string) => ["events", id, "live"] as const,   // staleTime:Infinity。LiveStore が権威
  members: (id: string) => ["events", id, "members"] as const,
  schedule: (id: string) => ["events", id, "schedule"] as const,
  counters: (id: string) => ["events", id, "counters"] as const,
  counterHistory: (id: string, cid: string) => ["events", id, "counters", cid, "history"] as const,
  publicEvent: (slug: string) => ["public", slug] as const,
};
```

### 6.5 mutation の境界（§1.2 の実装・M1）

**(A) 定義/メタ系（WS で流れない）= Query 楽観更新 + invalidate**

```ts
// hooks/mutations/useUpdateEvent.ts
export const useUpdateEvent = (eventId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; publicSlug?: string }) =>
      unwrap(api().api.events[":eventId"].$patch({ param: { eventId }, json: input })),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.event(eventId) });
      const prev = qc.getQueryData(qk.event(eventId));
      qc.setQueryData(qk.event(eventId), (old: EventDetail) => ({ ...old, ...input }));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(qk.event(eventId), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.event(eventId) }), // 定義系のみ
  });
};
```

**(B) ライブ系（WS で確定値）= LiveStore/PendingQueue 楽観、Query は触らない。M1: Idempotency-Key 必須**

```ts
// hooks/mutations/useAdjustCounter.ts
export const useAdjustCounter = (eventId: string, counterId: string) => {
  const { pending, store } = useLiveContext();
  return useMutation({
    mutationFn: (delta: number) =>
      unwrap(api().api.events[":eventId"].counters[":counterId"].adjust.$post({
        param: { eventId, counterId }, json: { delta }, header: idempotencyHeader(), // M1
      })),
    onMutate: (delta) => {
      const baseSeq = store.getCounter(counterId)?.seq ?? 0;
      const opId = pending.applyOptimisticCounter(counterId, delta, baseSeq); // 即 +1 表示
      return { opId };
    },
    onError: (_e, _v, ctx) => ctx && pending.rollbackOptimistic(ctx.opId),
    // 確定は WS counter broadcast(seq) が PendingQueue.reconcileFromVersion で overlay 相殺。invalidate しない
  });
};
```

```ts
// hooks/mutations/useTimerOps.ts （C2 + M1）
// path は design §4.2 厳密一致: events[":eventId"].schedule[":itemId"].timer.{start,pause,resume,complete,skip}.$post
//                                / .timer.extend.$patch
export const useTimerOps = (eventId: string, itemId: string) => {
  const { pending, store } = useLiveContext();
  const acc = api().api.events[":eventId"].schedule[":itemId"].timer;

  const start = useMutation({
    mutationFn: () =>
      unwrap<TimerSnapshotRes>(acc.start.$post({ param: { eventId, itemId }, header: idempotencyHeader() })), // M1
    onMutate: () => {
      const cur = store.getTimer(itemId);
      // 楽観遷移を保留（自動再送しない）。前提 status と baseVersion を記録（§4.5）
      return pending.applyOptimisticTimer(itemId, "start", cur?.status ?? "scheduled", store.getVersion());
    },
    onError: (e, _v, key) => {
      pending.rollbackOptimistic(key);
      // M2/C2: 409(isConflict)=同 track に running 等の前提崩れ → 再操作トースト
      if (e instanceof ApiError && e.isConflict) { /* useNoticeUndo で「すでに開始済みです。最新状態を確認してください」 */ }
    },
    // 確定は WS timer broadcast が reconcileFromVersion で status 突合（前提崩れなら破棄）
  });
  // pause/resume/complete/skip も同型（全て header: idempotencyHeader() を付与）。
  // extend は acc.extend.$patch({ param, json:{deltaSec}, header: idempotencyHeader() })。
  return { start /* , pause, resume, complete, skip, extend */ };
};
```

> **責務境界の明文化**: `router.invalidate` / `queryClient.invalidateQueries` は **(A) 定義系専用**。ライブ系は store/pending 内で完結し Query 無効化を起こさない。schedule reorder のように DO broadcast（`schedule` variant）も飛ぶものは **WS store が即時反映 + 念のため `invalidateQueries(qk.schedule)` で定義整合**の二段（store が先、Query が追従）。
> **M1 の二重防壁**: 上記のとおり全 write mutation に `header: idempotencyHeader()` を明示付与する。BE が `zValidator("header", z.object({ "idempotency-key": z.string().uuid() }))` を置けば RPC `$post`/`$patch` の引数で `header` が**必須**になり、付与漏れがコンパイルエラーになる。さらに任意で `api-client` に write 系を包む `writeRpc(fn)` ヘルパ（`header` を自動マージ）を用意し実行時にも保証する。

### 6.6 認証連携（M4）

- セッションガードは `_authed.tsx` `beforeLoad`（§3.4）。SSR は `apiClient.$fetch("/api/auth/get-session")`（**RPC アクセサを使わない・M4**）、browser は `authClient.getSession()`。AppShell のユーザー表示は `Route.useRouteContext().session` か `useSession()`。
- 401 グローバル: `getRouter()` 内で `setupApiClient(() => { void authClient.signOut(); router.navigate({ to: "/login" }); })`（§3.1）。Query `retry` も 401/403 を弾く。WS ticket（`POST /ws-ticket`）が 401 を返す場合も同経路（context.apiClient の onUnauthorized）。
- ログアウト: `await authClient.signOut()` → `queryClient.clear()` → `/login`。

### 6.7 接続状態 UI 連携

```tsx
// AppShell ヘッダ
function ConnectionChip() {
  const state = useConnectionState(); // connecting | connected | reconnecting | offline
  // connected=緑●LIVE / reconnecting=黄⟳(Loading) / offline=灰。color+icon+text 併記、aria-live。
}
```

- 長時間 `offline` 継続 / backoff 上限張り付きで `OfflineOverlay`（全画面 + 手動リロード）。
- `reconnecting`→`connected` 復帰時 `useNotice`「同期しました」。`store.getState().lastResyncReason` でギャップ起因を区別。

---

## 7. テスト / パフォーマンス

### 7.1 テスト構成（vitest + Testing Library + MSW）

```ts
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "jsdom", setupFiles: ["./test/setup.ts"], globals: true, include: ["src/**/*.test.{ts,tsx}"] },
});
```

`test/setup.ts`: `@testing-library/jest-dom` + MSW `server.listen/resetHandlers/close`。REST は MSW でモック（型は §6.3 の `InferResponseType` で縛り API 変更がテストに波及）。WS は `vi.stubGlobal` で fake WebSocket を差し替え `LiveMessage` を流し込む。

### 7.2 テスト対象（最重要順）

1. **LiveStore 単体（最重要・厚め）**: ① `version+1` の counter/timer 適用 ② version ギャップで `onResyncNeeded` 発火・状態を進めない ③ seq 後退 broadcast を無視 ④ `applySnapshot` で楽観 overlay 破棄・skew 再計算 ⑤ snapshot は version 権威で置換 ⑥ **M3: counter メッセージに `serverNowMs` が無くても適用でき、`clock.sync` が呼ばれないこと**。
2. **PendingQueue**: counter 楽観 overlay の `optimisticValue` 合算 → broadcast seq 到達で相殺 / timer 前提崩れ（status 不一致 or 409）で破棄 + `onNeedReoperate`。
3. **useRemainingMs + ServerClock（m1）**: `vi.useFakeTimers` + `performance.now` stub で running/paused/overrun が端末時計非依存に算出されるか（`remainingMs` 純関数自体は `@app/shared` 側でテスト）。`nowMs` が常に `clock.serverNow()` 由来であること。
4. **コンポーネント**: CounterControl の `＋` で即 +1（楽観）→ MSW 確定 → fake WS broadcast で確定合流 / BigTimer overrun 赤 / ConnectionChip `reconnecting` 黄⟳ / 401 で `onUnauthorized` 発火しログイン遷移（memory history）/ **C2: useTimerOps の start が正しい RPC path（`.../schedule/:itemId/timer/start`）と `Idempotency-Key` ヘッダで POST する（MSW ハンドラのパス・ヘッダで検証）**。
5. **再接続/ギャップ統合**: fake WS close → backoff 後 `resync()`（MSW `GET /live`）→ `applySnapshot` 整合の経路を1本通す。**C1: ticket フォールバック時に `?ticket=` を付けて接続する（fake WebSocket の URL を検証）**。
6. **SSR hydration（m2）**: LiveProvider が SSR で store を構築し `useTimer` が例外を出さず親 snapshot 値を返す（getServerSnapshot 安定値）。
7. **契約アサーション（m3）**: `api-types.ts` の `_assertFullSnapshotShape` が型レベルで通ること（tsgo typecheck に含める）。

### 7.3 パフォーマンス

- **route 単位 code splitting**（TanStack Start 既定）。モジュール Page は registry の `Page` を `React.lazy` 化し未使用モジュール（OST 等）を初期バンドルから除外。
- **Yamada 個別 import 厳守**（barrel 禁止。oxlint で barrel import を禁止できると尚良い）。
- **Query SSR dehydrate**（loader prefetch → hydrate）で二重フェッチ回避。`qk.eventLive` は `staleTime: Infinity` で WS と競合させない。
- **Live 再描画最小化**: `useSyncExternalStore` の購読粒度（timer/counter 単体）+ 同一参照返却。毎秒更新は `useRemainingMs` ローカル interval に閉じ込め store 全体を毎秒通知しない。
- **m4（preflight）**: prod は api サブドメイン直叩き＝`Idempotency-Key`（カスタムヘッダ）付き write は**必ず preflight(OPTIONS) が発生**する。write の体感遅延が preflight 往復由来になり得るため、BE 側で `cors({ maxAge })` による preflight キャッシュを前提とする（FE はキャッシュ前提で連打時の往復が抑制される設計）。dev は同一オリジン(vite proxy)で preflight 不要。
- **バンドル可視化**（既存 rollup-plugin-visualizer）: `ANALYZE=1` で `dist/stats.html`、`@yamada-ui`/`@tanstack/react-query` の重みを定期確認。

---

## 8. フロントエンド実装着手順序

design §8 の全体順序（0:D1 placeholder → 1:DB → 2:shared → … → 7:DO → 8:Live REST+WS）に対し、Web（§8-9〜11）を以下に分解。**§8-2（`@app/shared` の `TimerSnapshot`/`FullSnapshot`/`LiveMessage`/`ModuleSnapshot`/`ErrorBody`/`ErrorCode`/`elapsedMs`/`remainingMs`）と §8-6/8（REST/Live エンドポイント・timer の `/schedule/:itemId/timer/*` マウント・write 系の `zValidator("header")`）が前提**。

1. **ブロッカー潰し（最優先）**: `vite.config.ts` の `/api` proxy に **`ws: true` 追加（M6）**。`@tanstack/react-query`・QR ライブラリ（deps）、testing-library 系・msw・jsdom（devDeps）を install。`@app/shared` に `ErrorBody`/`ErrorCode` 追記を BE と同時に確定（M2）。
2. **基盤層**: `lib/env.ts`（origin 集約・`eventWsUrl` の `?ticket=`）→ `api-client.ts`（env.ts 参照・`$fetch`・`idempotencyHeader`・`writeRpc`・singleton）/`auth-client.ts` 改修 → `lib/api-error.ts`（共有 `ErrorCode`）・`lib/api-types.ts`（**timer RPC 型 C2 + m3 アサーション**）・`lib/query.ts`・`lib/theme.ts`。
3. **router/context**: `router-context.ts`・`lib/session.ts`（**SSR=素 fetch `/api/auth/get-session` M4**）・`lib/ssr-client.ts` → `router.tsx`（context 構築 + QueryClient + register + `setupApiClient`）→ `__root.tsx`（context 化 + theme + QueryClientProvider + HeadContent/Scripts）。
4. **認証ガード + AppShell**: `_authed.tsx` + `components/shell/{AppShell,BottomTab,AppHeader,ConnectionChip}` + `index.tsx`/`login.tsx` 改修。
5. **一覧/作成**: `events.index.tsx`（loader prefetch + search）・`events.new.tsx` + `features/events-list/*` + `useUpdateEvent` 等定義系 mutation。
6. **リアルタイム中核**: `lib/live/{clock,store,socket,ticket,pending}.ts` + `lib/live/react/{LiveProvider,hooks,useTimerTick}`（**LiveProvider は context.apiClient 受領 M5 / SSR store 構築 m2**）→ **store の単体テストを先に書く**（§7.2-1・M3 ケース含む）。
7. **詳細 + Live ダッシュボード**: `events.$eventId.tsx`（REST snapshot 並列 prefetch）→ `EventDetailTabsShell`（`LiveProvider eventId apiClient={context.apiClient}` mount）→ `events.$eventId.index.tsx`（**client-only 境界 m2**）+ `features/live-dashboard/*` + `components/timer/BigTimer`・`components/counter/CounterControl` + `useAdjustCounter`/`useTimerOps`（**C2 path + M1 header**）。
8. **残りタブ**: timetable / members / settings（親 snapshot 消費 + 各 mutation）。
9. **モジュールレジストリ**: `modules/registry.ts`(+types) + timetable/attendance 実装 + 汎用 `modules.$moduleType.tsx` + `lib/module-snapshot.ts`（exhaustive switch）。
10. **Should 機能**: 再接続再同期（種別分け PendingQueue・bfcache 復帰再 snapshot・**ticket フォールバック C1**）・`ConfirmUndo`/`useNoticeUndo`（**409=isConflict 再操作トースト**）・`QRShare`・残り少/超過アラート（`navigator.vibrate`）・presence を Live に重ねる。
11. **公開ページ（Phase2 冒頭）**: `e.$slug.tsx`（SSR・`qk.publicEvent` 短ポーリング・管理者 DO 相乗りしない）。

---

### 関連ファイル（絶対パス・抜粋）

新規:
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/router-context.ts`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/lib/{env,api-error,api-types,query,session,ssr-client,theme,module-snapshot}.ts`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/lib/live/{clock,store,socket,ticket,pending}.ts`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/lib/live/react/{LiveProvider.tsx,hooks.ts,useTimerTick.ts}`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/routes/_authed.tsx` + `_authed/events.*.tsx`（`events.$eventId.modules.$moduleType.tsx` 含む）+ `e.$slug.tsx`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/features/{events-list,event-shell,live-dashboard,timetable,members,settings}/*`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/modules/{registry.ts,registry.types.ts,timetable/index.tsx,attendance/index.tsx,ost/index.tsx}`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/components/{shell,timer,counter,feedback,share}/*`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/hooks/{useIdempotencyKey,useNoticeUndo,useVisibilityResync}.ts` + `hooks/mutations/{useUpdateEvent,useAdjustCounter,useTimerOps,useMembers}.ts`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/vitest.config.ts` + `test/{setup.ts,msw/{handlers,server}.ts}` + `src/**/*.test.{ts,tsx}`

改修:
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/lib/{api-client.ts,auth-client.ts}`（env.ts 参照・onUnauthorized・singleton・`$fetch`(M4)・`idempotencyHeader`/`writeRpc`(M1)）
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/src/router.tsx`・`src/routes/{__root,index,login}.tsx`
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/vite.config.ts`（**`/api` proxy に `ws: true`・M6 ブロッカー**）
- `/Users/fujitanisora/ghq/github.com/sorafujitani/tech-event-scheduler/apps/web/package.json`（deps/devDeps 追加）

BE/shared 側で噛み合わせる必要がある契約（FE 着手前に確定）:
- **C1**: `apps/api` の `routes/live.ts` GET `/ws` で元 URL の `search`（`?ticket=`）を保持して DO へ転送。
- **C2**: `timerRoutes` を `scheduleRoutes` の `/:itemId/timer` 配下に `.route()` マウント（design §4.2 path 厳密一致）。
- **M1**: timer/counter write に `zValidator("header", z.object({ "idempotency-key": z.string().uuid() }))`。`apps/api/src/index.ts` の CORS `allowHeaders` に `Idempotency-Key` 追加（現状 `["Content-Type","Authorization"]` のみ）。
- **M2**: `@app/shared` に `ErrorBody`/`ErrorCode` 単一定義（BE `errors/index.ts` も import）。
- **M3**: DO の WS counter broadcast に `serverNowMs` を含めない（`@app/shared` `LiveMessage` を唯一の wire 契約に）。
- **m3**: BE GET `/live`・snapshot 戻り型を `c.json(... satisfies FullSnapshot)` 注釈。
- **m4**: BE `cors({ maxAge })` で preflight キャッシュ。

実装着手前の前提（再掲）: ① `@tanstack/react-query`・testing-library 系・msw が未導入（要 install）② **`vite.config.ts` の `/api` proxy が `ws:true` 未設定＝dev WS 全不通ブロッカー（M6）** ③ §6.3 の RPC アクセサ解決は API 側の単一 app チェーン厳守（design §4.1）+ **timer の `/:itemId/timer` マウント（C2）** に依存 ④ WS close code（認可失敗時 `1008`/`4401`）・app 層 `ping`/`pong`・**ticket query 保持（C1）**・**counter broadcast の serverNowMs 不在（M3）** は EventRoom DO 実装とのすり合わせが必要 ⑤ `@app/shared` への §8-2 + `ErrorBody`/`ErrorCode`（M2）追記が Web 着手の前提。