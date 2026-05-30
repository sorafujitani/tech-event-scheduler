import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

// requireSession の実ミドルウェアを通る軽量 L4 テスト（認証セッション不要で検証できる範囲）。
describe("認可（未認証）", () => {
  it("未認証の GET /api/events は 401 + ErrorBody", async () => {
    const res = await app.request(
      "/api/events",
      { method: "GET" },
      env as unknown as Record<string, unknown>,
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("未認証の POST /api/events も 401", async () => {
    const res = await app.request(
      "/api/events",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      },
      env as unknown as Record<string, unknown>,
    );
    expect(res.status).toBe(401);
  });
});
