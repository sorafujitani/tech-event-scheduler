import type { ErrorBody, ErrorCode } from "@app/shared";

// M2: ErrorBody/ErrorCode は @app/shared 単一ソース。
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  // 文字列リテラルでなく共有 ErrorCode に紐付け（drift をコンパイル検出）。
  get isConflict() {
    return this.status === 409 || this.code === "CONFLICT";
  }
}

// hono の ClientResponse / DOM Response / Workers Response いずれも満たす最小構造。
// （workers-types の Response は webSocket 必須のため Response 直受けにしない）
interface ResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export async function unwrap<T>(res: ResponseLike): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: Partial<ErrorBody> = {};
  try {
    body = (await res.json()) as Partial<ErrorBody>;
  } catch {
    /* 非 JSON */
  }
  throw new ApiError(res.status, body.code, body.error ?? `HTTP ${res.status}`);
}
