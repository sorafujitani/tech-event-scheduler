import type { AppType } from "@app/api/types";
import { hc } from "hono/client";
import { apiOrigin } from "./env";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

// 純粋な hono RPC クライアント。
// 注意: hc は Proxy で `$<method>` プロパティを HTTP メソッドとして解釈するため、
// このクライアントに `$fetch` 等のメソッドを生やしてはいけない（`$fetch`→method "FETCH" 扱いになる）。
export type ApiClient = ReturnType<typeof hc<AppType>>;

export type ApiClientOptions = {
  /** SSR ローダ等が上書き（service binding / localhost）。既定はブラウザ環境。 */
  origin?: string;
  fetch?: Fetcher;
  onUnauthorized?: () => void;
};

const makeBrowserFetch =
  (onUnauthorized?: () => void): Fetcher =>
  async (input, init) => {
    const res = await globalThis.fetch(input, {
      ...init,
      credentials: "include",
    });
    if (res.status === 401) onUnauthorized?.(); // 401 グローバル捕捉
    return res;
  };

const resolveConfig = (options: ApiClientOptions) => ({
  origin: options.origin ?? apiOrigin(),
  fetch: options.fetch ?? makeBrowserFetch(options.onUnauthorized),
});

export const createApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const { origin, fetch } = resolveConfig(options);
  return hc<AppType>(origin, { fetch });
};

/**
 * RPC アクセサに無いパス(better-auth /api/auth/*)を同一 fetch 経路で叩く生 fetch（M4）。
 * hc に生やすと `$fetch`→method "FETCH" 誤認になるため独立関数にする。
 */
export const createAuthFetch =
  (options: ApiClientOptions = {}): Fetcher =>
  (input, init) => {
    const { origin, fetch } = resolveConfig(options);
    const url =
      typeof input === "string" && input.startsWith("/")
        ? `${origin}${input}`
        : input;
    return fetch(url, init);
  };

// ブラウザ用シングルトン（mutation hook 専用。LiveProvider は context.apiClient を使う＝M5）。
let singletonClient: ApiClient | null = null;
export const setupApiClient = (onUnauthorized: () => void): void => {
  singletonClient = createApiClient({ onUnauthorized });
};
export const api = (): ApiClient =>
  (singletonClient ??= createApiClient());

// M1: Idempotency-Key を必ず付与する write 系ヘッダ（BE の zValidator("header") に対応）。
// hono は header キーを小文字正規化するため RPC 型も "idempotency-key" で現れる。
export const idempotencyHeader = (): { "idempotency-key": string } => ({
  "idempotency-key": crypto.randomUUID(),
});
