# tech-event-scheduler

テックイベントの当日進行を、タイマー・入場カウンター・タイムテーブル・複数運営者間のリアルタイム同期で支えるWebアプリ。

## スタック

| レイヤ | 採用 |
| --- | --- |
| ランタイム / パッケージマネージャ | Bun 1.3.x（互換用に Node.js 22 も devShell に同梱） |
| 言語 | TypeScript 5.9（型チェックは `tsgo` / TypeScript Native Preview, `--noEmit`） |
| モノレポ | Bun workspaces (`apps/*`, `packages/*`) + Turborepo |
| タスクランナー | go-task (`Taskfile.yml`) |
| Lint / Format | oxlint（`oxfmt` CLI 安定までは `oxlint --fix` で代用） |
| テスト | Vitest |
| API | Hono on Cloudflare Workers (`apps/api`) |
| Web | TanStack Start + React 19 on Cloudflare Workers (`apps/web`) |
| DB | Cloudflare D1 (SQLite) + Drizzle ORM / drizzle-kit (`packages/db`) |
| 認証 | better-auth |
| 日付 | temporal-polyfill |
| バリデーション | Zod 4 |
| Cloudflareリソース管理 | Wrangler設定 + 検証スクリプト + D1 migrations |
| 開発シェル | Nix flake + direnv |

## 前提ツール

以下のどちらかで揃える。

### 推奨: Nix + direnv

`flake.nix` が `bun` / `nodejs_22` / `go-task` / `sqlite` / `jq` を揃える。

```bash
direnv allow   # 初回のみ
```

`.envrc` は `use flake` のみ。以後リポジトリに `cd` するだけで `nix develop` 相当のシェルが立ち上がり、`shellHook` が bun / node / task のバージョンを表示する。

### 手動

Nix を使わない場合は以下を個別に入れる。

- Bun >= 1.3.0
- Node.js 22 系
- go-task (`task` コマンド)
- SQLite CLI（ローカル D1 を直接覗く場合のみ）
- jq（Cloudflareの検証と本番endpoint確認に使用）

## 初期セットアップ

```bash
bun install
```

Bun workspaces により `apps/*` と `packages/*` の依存が一括解決される。`packageManager: "bun@1.3.9"` を `package.json` に固定しているので、Bun のバージョン差で挙動が割れたら `bun upgrade` で揃える。

## 日常コマンド

すべて `task <name>`（`bun run <name>` も同等）で実行する。

| コマンド | 用途 |
| --- | --- |
| `task` | タスク一覧 |
| `task dev` | `apps/web` と `apps/api`（wrangler dev, port 8788）を並列起動 |
| `task build` | 全ワークスペースを Turborepo 経由でビルド |
| `task lint` | oxlint |
| `task fmt` | `oxlint --fix`（oxfmt CLI 確定までの暫定） |
| `task typecheck` | 各パッケージで `tsgo --noEmit`（Turborepo がオーケストレーション） |
| `task test` | Vitest |
| `task cloudflare:check` | D1・Worker secrets・デプロイ済みWorker・未適用migrationをread-only確認 |
| `task ci` | lint → typecheck → test → build（CI エントリポイント） |

## DB / マイグレーション

Drizzle スキーマは `packages/db/src/schema/` に置き、生成物は `packages/db/migrations/` に出力される。`apps/api/wrangler.jsonc` の `migrations_dir` がそのディレクトリを参照しているので、API 側の wrangler から直接適用できる。

```bash
task db:gen            # スキーマ変更後にマイグレーション生成
task db:migrate:local  # ローカル D1 に適用
task db:migrate:prod   # 本番 D1 に適用（要 Cloudflare 認証）
```

## Cloudflareリソース管理

```bash
task cloudflare:check      # 既存リソースを変更せず照合
task cloudflare:bootstrap  # D1が存在しない新規環境でのみ作成
```

`apps/api/wrangler.jsonc` と `apps/web/wrangler.jsonc` をCloudflareアプリリソースの正準設定とする。D1の作成だけは明示的なbootstrap、schema変更はDrizzle migration、Worker・binding・Durable Object・service binding・公開変数・将来のカスタムドメインはWranglerで管理する。

`cloudflare:bootstrap` は、認証中のアカウントに同名D1が存在せず、設定上のIDも明示的なplaceholderである場合にしか作成しない。既存D1の削除は自動化しない。詳しい境界と復旧手順は `docs/cloudflare-operations.md` を参照。

## デプロイ

```bash
task deploy:web
task deploy:api
task deploy:prod  # check → migrate → api/web deploy → endpoint確認
```

本番D1 `tech-event-scheduler` のUUIDは `apps/api/wrangler.jsonc` に明示している。`deploy:api` はplaceholderのままでは停止し、`cloudflare:check` は設定UUIDと認証先アカウントの実D1が一致しなければ失敗する。

## 環境変数 / シークレット

- `.env` / `.env.test` は gitignore 済み。直接コミットしない。
- Cloudflare Workers のローカル用シークレットは `apps/api/.env` に置く（gitignore 済み、テンプレートは `apps/api/.env.example`）。`.dev.vars` が存在すると `.env` より優先されるので併置しない。
- 本番シークレットは `bun x wrangler secret put <NAME>` で Cloudflare に投入する。

## TypeScript 設定の要点

`tsconfig.base.json` を全パッケージが `extends` する。`strict` に加えて以下を有効化:

- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitOverride`
- `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax`
- `isolatedModules`

`oxlint` 側でも `typescript/consistent-type-imports` と `typescript/no-explicit-any` を `error` にしているので、型インポートの書き分けと `any` 排除はコンパイルだけでなく lint でも落ちる。

## リポジトリ構成

```
.
├── apps/
│   ├── api/              # Hono on Cloudflare Workers
│   └── web/              # TanStack Start Web Worker
├── packages/
│   ├── db/               # Drizzle スキーマ + migrations
│   ├── shared/           # クロスカット型・ユーティリティ
│   ├── oxlint-config/    # 共有 oxlint 設定
│   ├── tsconfig/         # 共有 tsconfig プリセット
│   └── vite-config/      # 共有 Vite 設定
├── scripts/              # Cloudflare read-only検証 / 安全なbootstrap
├── flake.nix             # devShell 定義
├── Taskfile.yml          # タスク定義
├── turbo.json            # Turborepo パイプライン
└── tsconfig.base.json
```
