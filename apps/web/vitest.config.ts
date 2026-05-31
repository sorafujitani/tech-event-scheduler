import { defineConfig } from "vitest/config";

// アプリの vite.config(cloudflare/tanstackStart plugin)とは分離した軽量 test 設定。
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
