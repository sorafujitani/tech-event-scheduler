import type { AppType } from "@app/api/types";
import { hc } from "hono/client";
import { apiOrigin } from "./env";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ApiClient = ReturnType<typeof hc<AppType>> & {
  /** M4: RPC アクセサに無いパス(better-auth /api/auth/*)を同一 fetch 経路で叩く薄いアクセサ */
  $fetch: Fetcher;
};

export type ApiClientOptions = {
  /** SSR ローダ等が上書き（service binding）。既定はブラウザ環境。 */
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

export const createApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const origin = options.origin ?? apiOrigin();
  const customFetch = options.fetch ?? makeBrowserFetch(options.onUnauthorized);
  const client = hc<AppType>(origin, { fetch: customFetch }) as ApiClient;
  // SSR は origin 付き絶対 URL、browser は相対 /api/... を同じ fetch で叩く（M4）。
  client.$fetch = (input, init) =>
    customFetch(
      typeof input === "string" && input.startsWith("/")
        ? `${origin}${input}`
        : input,
      init,
    );
  return client;
};

// ブラウザ用シングルトン（mutation hook 専用。LiveProvider は context.apiClient を使う＝M5）。
let singletonClient: ApiClient | null = null;
export const setupApiClient = (onUnauthorized: () => void): void => {
  singletonClient = createApiClient({ onUnauthorized });
};
export const api = (): ApiClient => (singletonClient ??= createApiClient());

// M1: Idempotency-Key を必ず付与する write 系ヘッダ（BE の zValidator("header") に対応）。
// hono は header キーを小文字正規化するため RPC 型も "idempotency-key" で現れる。
export const idempotencyHeader = (): { "idempotency-key": string } => ({
  "idempotency-key": crypto.randomUUID(),
});
