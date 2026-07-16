import { getRequestHeaders } from "@tanstack/react-start/server";
// @cloudflare/vite-plugin が ssr 環境で解決。browser バンドルへは混入させない（createIsomorphicFn で除去）。
import { env } from "cloudflare:workers";
import type { ApiClientOptions } from "./api-client";

interface ApiBinding {
  fetch: (req: Request) => Promise<Response>;
}

// wrangler の型生成が無い環境のため、この Worker が持つ binding を明示する。
interface WebWorkerEnv {
  API: ApiBinding;
}

// service binding fetch は自動で Cookie を運ばない → 受信リクエストの Cookie を明示転送（M4）。
const withCookie = (init?: RequestInit): Headers => {
  const headers = new Headers(init?.headers);
  const cookie = getRequestHeaders().get("cookie");
  if (cookie) headers.set("cookie", cookie);
  return headers;
};

export const createSsrClientOptions = (): ApiClientOptions => {
  if (import.meta.env.PROD) {
    // prod: intra-Worker の service binding（ダミー origin、実体は env.API.fetch）。
    return {
      origin: "https://api.internal",
      fetch: (input, init) => {
        const api = (env as WebWorkerEnv).API;
        return api.fetch(
          new Request(input as RequestInfo, { ...init, headers: withCookie(init) }),
        );
      },
    };
  }
  // dev: api は別プロセス(wrangler dev :8788)。split process で service binding は不安定なため
  // HTTP 直 fetch（workerd SSR から localhost へ到達可能）。Cookie 転送で better-auth 認可を通す。
  return {
    origin: "http://localhost:8788",
    fetch: (input, init) =>
      globalThis.fetch(input, { ...init, headers: withCookie(init) }),
  };
};
