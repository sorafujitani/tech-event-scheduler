import { describe, expect, it } from "vitest";
import { ApiError, unwrap } from "./api-error";

const res = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("unwrap", () => {
  it("2xx は body を返す", async () => {
    await expect(unwrap(res(200, { eventId: "e1" }))).resolves.toEqual({
      eventId: "e1",
    });
  });

  it("エラーは ApiError(status, code) を throw", async () => {
    try {
      await unwrap(res(409, { error: "conflict", code: "CONFLICT" }));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(409);
      expect(err.code).toBe("CONFLICT");
      expect(err.isConflict).toBe(true);
    }
  });

  it("非 JSON エラーでも status で ApiError を作る", async () => {
    const bad = {
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    };
    await expect(unwrap(bad)).rejects.toBeInstanceOf(ApiError);
  });

  it("isUnauthorized / isForbidden", () => {
    expect(new ApiError(401, "UNAUTHORIZED", "x").isUnauthorized).toBe(true);
    expect(new ApiError(403, "FORBIDDEN", "x").isForbidden).toBe(true);
  });
});
