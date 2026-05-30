import path from "node:path";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  // D1 マイグレーションを読み込み、setup で各 isolate に適用する（packages/db を単一ソース）。
  const migrations = await readD1Migrations(
    path.join(__dirname, "../../packages/db/migrations"),
  );

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          isolatedStorage: true,
          // wrangler.jsonc を単一ソースに D1 binding / compat を継承
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              // better-auth の validateEnv(zod) を満たすダミー値（WEB_ORIGIN/COOKIE_DOMAIN は wrangler.jsonc vars 由来）。
              GOOGLE_CLIENT_ID: "test-google-client-id",
              GOOGLE_CLIENT_SECRET: "test-google-client-secret",
              BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789abcdef",
              BETTER_AUTH_URL: "http://localhost:5173",
            },
          },
        },
      },
    },
  };
});
