# tech-event-scheduler

開発環境のセットアップと日常運用をまとめた README。プロダクトのスコープは未確定のため、ここでは触れない。

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
| Web | `apps/web`（現状スキャフォールドのみ） |
| DB | Cloudflare D1 (SQLite) + Drizzle ORM / drizzle-kit (`packages/db`) |
| 認証 | better-auth |
| 日付 | temporal-polyfill |
| バリデーション | Zod 4 |
| IaC | OpenTofu (`infra/terraform/`) |
| 開発シェル | Nix flake + direnv |

## 前提ツール

以下のどちらかで揃える。

### 推奨: Nix + direnv

`flake.nix` が `bun` / `nodejs_22` / `go-task` / `opentofu` / `sqlite` / `jq` / `awscli2` をピン留めしている。

```bash
direnv allow   # 初回のみ
```

`.envrc` は `use flake` のみ。以後リポジトリに `cd` するだけで `nix develop` 相当のシェルが立ち上がり、`shellHook` が bun / node / task / tofu のバージョンを表示する。

### 手動

Nix を使わない場合は以下を個別に入れる。

- Bun >= 1.3.0
- Node.js 22 系
- go-task (`task` コマンド)
- OpenTofu（インフラ操作する場合のみ）
- SQLite CLI（ローカル D1 を直接覗く場合のみ）
- AWS CLI v2（必要に応じて）

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
| `task ci` | lint → typecheck → test → build（CI エントリポイント） |

## DB / マイグレーション

Drizzle スキーマは `packages/db/src/schema/` に置き、生成物は `packages/db/migrations/` に出力される。`apps/api/wrangler.jsonc` の `migrations_dir` がそのディレクトリを参照しているので、API 側の wrangler から直接適用できる。

```bash
task db:gen            # スキーマ変更後にマイグレーション生成
task db:migrate:local  # ローカル D1 に適用
task db:migrate:prod   # 本番 D1 に適用（要 Cloudflare 認証）
```

## インフラ (OpenTofu)

```bash
task infra:init   # provider DL（初回のみ）
task infra:plan
task infra:apply
```

定義は `infra/terraform/prod/` 配下。state の置き場所はそこの設定に従う。

## デプロイ

```bash
task deploy:web
task deploy:api
```

`deploy:api` は `apps/api/wrangler.jsonc` の `database_id` がプレースホルダ (`00000000-0000-0000-0000-000000000000`) のままだと preconditions で停止する。Cloudflare 側で D1 を作成（`task infra:apply` 出力か `wrangler d1 create` で取得）した UUID を `wrangler.jsonc` に反映してからデプロイする。

## 環境変数 / シークレット

- `.env` / `.env.test` は gitignore 済み。直接コミットしない。
- Cloudflare Workers のローカル用シークレットは `apps/api/.dev.vars` に置く（gitignore 済み）。
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
│   └── web/              # フロントエンド（Cloudflare 配信予定）
├── packages/
│   ├── db/               # Drizzle スキーマ + migrations
│   ├── shared/           # クロスカット型・ユーティリティ
│   ├── oxlint-config/    # 共有 oxlint 設定
│   ├── tsconfig/         # 共有 tsconfig プリセット
│   └── vite-config/      # 共有 Vite 設定
├── infra/terraform/      # OpenTofu 定義
├── flake.nix             # devShell 定義
├── Taskfile.yml          # タスク定義
├── turbo.json            # Turborepo パイプライン
└── tsconfig.base.json
```
