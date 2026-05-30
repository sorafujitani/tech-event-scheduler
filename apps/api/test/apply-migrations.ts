import { applyD1Migrations, env } from "cloudflare:test";

// 各テスト isolate の D1 にマイグレーションを適用（vitest.config の TEST_MIGRATIONS 経由）。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
