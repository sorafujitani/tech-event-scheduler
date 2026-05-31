import { getRequestHeaders } from "@tanstack/react-start/server";
// @cloudflare/vite-plugin が ssr 環境で解決。browser バンドルへは混入させない。
import { env } from "cloudflare:workers";
import type { ApiClientOptions } from "./api-client";

interface ApiBinding {
  fetch: (req: Request) => Promise<Response>;
}

export const createSsrClientOptions = (): ApiClientOptions => ({
  // service binding は intra-Worker。ダミー origin（実際は env.API.fetch へ向く）。
  origin: "https://api.internal",
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    // service binding fetch は自動で Cookie を運ばない → 受信リクエストの Cookie を明示転送（M4）。
    const cookie = getRequestHeaders().get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const api = (env as unknown as { API: ApiBinding }).API;
    return api.fetch(new Request(input as RequestInfo, { ...init, headers }));
  },
});
