import type { ErrorBody, ErrorCode } from "@app/shared";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { log } from "../lib/log";

// HTTP status は ErrorCode から一意に決まる（DO 側 §5.9 でも再利用）。
const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 500> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
};

export const statusForCode = (c: ErrorCode) => STATUS[c];

/** ドメイン由来のエラー。onError が ErrorBody に正規化する。 */
export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
  toBody(): ErrorBody {
    return { error: this.message, code: this.code };
  }
  get status() {
    return STATUS[this.code];
  }
}

export const onError = (err: Error, c: Context): Response => {
  if (err instanceof DomainError) return c.json(err.toBody(), err.status);
  // zValidator の 400 などは HTTPException で飛んでくる
  if (err instanceof HTTPException) {
    const code: ErrorCode =
      err.status === 400
        ? "BAD_REQUEST"
        : err.status === 401
          ? "UNAUTHORIZED"
          : err.status === 403
            ? "FORBIDDEN"
            : err.status === 404
              ? "NOT_FOUND"
              : "INTERNAL";
    return c.json({ error: err.message, code } satisfies ErrorBody, err.status);
  }
  // 未捕捉エラーの最終フォールバック観測
  log("error", "unhandled", { msg: err.message, stack: err.stack });
  return c.json(
    { error: "internal error", code: "INTERNAL" } satisfies ErrorBody,
    500,
  );
};
