# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

This repository is currently a bare scaffold — only `README.md` (title only), `LICENSE`, and `.gitignore` are committed. There is no source code, no package manifest, and no build/test tooling configured yet. When you are asked to add code, confirm the intended stack with the user before scaffolding, since the choice is not yet locked in.

## Inferred Stack (from `.gitignore` only — not yet authoritative)

The `.gitignore` is Node-flavored and contains a few hints worth respecting once code lands:

- Node.js / Bun runtime is anticipated. Both `node_modules/` and `node_modules.bun` are ignored, and there is a `# bun deploy file` comment block, so prefer Bun-compatible code unless the user says otherwise.
- SQLite is anticipated as the data store (`*.sqlite` is ignored). Database files should never be committed.
- TypeScript build artifacts (`*.tsbuildinfo`, `dist/`) and Next.js / Nuxt.js / Gatsby outputs are pre-ignored, but no framework has actually been chosen.
- `.env` and `.env.test` are ignored — keep secrets out of the repo.

Treat these as defaults to maintain, not as decisions that have been made.

## Project Intent

The repository name (`tech-event-scheduler`) is the only signal of purpose currently in-tree. Do not invent product requirements; ask the user when scope is unclear.
