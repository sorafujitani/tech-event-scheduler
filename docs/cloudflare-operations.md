# Cloudflare operations

## Source of truth

| 対象 | 正準 |
| --- | --- |
| API Worker、D1 binding、Durable Object、公開変数 | `apps/api/wrangler.jsonc` |
| Web Worker、assets、API service binding | `apps/web/wrangler.jsonc` |
| D1 schema | `packages/db/migrations/` のDrizzle SQL migrations |
| APIの機密値 | Cloudflare Worker Secrets |
| GitHub Actionsからの認証 | GitHub Actions Secrets |

Terraform/OpenTofuのstateは持たない。Wranglerで表現できるアプリ実行リソースを設定ファイルに置き、D1の存在やsecretのように値をリポジトリへ保存できない対象は検証スクリプトで実環境と照合する。

## Read-only verification

```bash
task cloudflare:check
```

以下を変更せずに確認する。

- 本番D1 `tech-event-scheduler` の名前とUUIDが設定と一致する
- API Workerに `BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` が存在する
- API/Web Workerにデプロイ済みversionが存在する
- 本番D1に未適用migrationがない

認証先アカウントが違う、同名D1のUUIDが違う、secretやWorkerがない場合は処理を止める。

## D1 bootstrap boundary

```bash
task cloudflare:bootstrap
```

このタスクは新規環境の初回作成専用で、既存リソースを削除・更新しない。

1. 同名かつ同UUIDのD1がある場合は何もしない。
2. 同名D1のUUIDが設定と違う場合は停止する。
3. 設定に実UUIDがあるのにD1が見つからない場合は、別アカウントや認証権限の可能性があるため停止する。
4. 同名D1がなく、設定が明示的なplaceholder UUIDの場合だけD1を作成する。作成後はWranglerが表示したUUIDを設定へ反映する。

D1削除の自動タスクは用意しない。削除が必要な場合は、対象アカウント、UUID、バックアップ、影響範囲を別途確認する。

## Production deployment

```bash
task deploy:prod
```

ローカルでは `cloudflare:check → D1 migration → API deploy → Web deploy → endpoint確認` の順に実行する。GitHub ActionsもCI成功時の正確なcommit SHAをcheckoutし、同じ確認とmigrationを通してから両Workerをdeployする。

GitHub Actionsには次のRepository Secretsが必要。

- `CLOUDFLARE_ACCOUNT_ID`: 対象CloudflareアカウントID
- `CLOUDFLARE_API_TOKEN`: Custom tokenとして対象アカウントだけに絞り、Account permissionsの`Workers Scripts: Edit`と`D1: Edit`を付与したAPI token

値はリポジトリへ保存しない。API WorkerのOAuth/認証secretはGitHub SecretsではなくCloudflare Worker Secretsへ登録する。

将来Custom DomainをCIから設定する場合だけ、対象zoneに限定した`Workers Routes: Edit`も追加する。workers.devで運用している現時点では不要。

## Custom domains

Custom Domainを導入するときは、対象Workerの`wrangler.jsonc`にrouteを追加してdeployする。先にCloudflare zoneへの権限と、API/Webのhostname設計を確定する。

Web側にはWorkers.devのAPI URLを参照する箇所があるため、API Custom Domainだけを先行追加しない。Cookie domain、Better Auth URL、Web origin、OAuth redirect URI、WebのAPI originを同じ変更で揃えてから切り替える。

## Rollback and recovery

- WorkerコードはWranglerのversion/rollback機能で直前の正常versionへ戻す。
- Durable Object migration tagは一度deployした内容を編集・再利用しない。変更時は新しいtagを追加する。
- D1 schemaは破壊的な巻き戻しを避け、後方互換なforward-fix migrationを優先する。
- `cloudflare:check` がアカウントやUUIDの不一致を検出したら、作成やdeployをせず認証先を確認する。
- Worker Secretを更新する前に対象Worker名を確認し、欠落時は同名secretを再投入してから再検証する。
