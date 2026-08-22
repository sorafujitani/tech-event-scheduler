# CLAUDE.md

## Repository Status

This is an implemented Bun/TypeScript monorepo for a tech-event operations
web app. It contains a Hono API Worker, a TanStack Start Web Worker, Cloudflare
D1, and one EventRoom Durable Object per event.

## Development Rules

- Use Bun workspaces and the tasks in `Taskfile.yml`.
- Run `task ci` before handing off code changes.
- Keep secrets in `apps/api/.env` locally and in Cloudflare Worker Secrets in
  production. Never commit real secret values.
- Preserve unrelated working-tree changes.
- Treat `apps/api/wrangler.jsonc` and `apps/web/wrangler.jsonc` as the source of
  truth for Cloudflare application resources and bindings.
- Use `task cloudflare:check` for read-only production inventory verification.
- Never automate D1 deletion. `task cloudflare:bootstrap` may create D1 only
  when the config contains the explicit placeholder ID and no same-name D1
  exists in the authenticated account.
- Apply D1 migrations before deploying either Worker.

## Cloudflare Ownership

- Wrangler config: Workers, bindings, Durable Object migrations, public vars,
  assets, service bindings, and future custom domains.
- Drizzle SQL migrations: D1 schema history.
- Wrangler Worker Secrets: Google OAuth and Better Auth secrets.
- GitHub Actions Secrets: CI-only Cloudflare API token and account ID.

Do not add Terraform/OpenTofu or a second infrastructure state system without
an explicit architecture decision.
