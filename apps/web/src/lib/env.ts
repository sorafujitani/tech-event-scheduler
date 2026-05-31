// 全 origin/URL 分岐の唯一ソース。
const PROD_API_ORIGIN =
  "https://tech-event-scheduler-api.fujitanisora0414.workers.dev";

export const apiOrigin = (): string =>
  import.meta.env.PROD ? PROD_API_ORIGIN : "";

// better-auth/react は createAuthClient 時に baseURL を絶対URLとして検証する。
// dev の相対 "/api/auth" は SSR(location なし)で throw するため、絶対URLを返す。
// browser は location.origin（dev は vite proxy 経由で /api → :8788）、prod は api サブドメイン直。
export const authBaseURL = (): string => {
  if (import.meta.env.PROD) return `${PROD_API_ORIGIN}/api/auth`;
  const origin =
    typeof location !== "undefined" ? location.origin : "http://localhost:5173";
  return `${origin}/api/auth`;
};

/**
 * C1/§3.5: WS は service binding を通せない。prod=api オリジン直 / dev=同一オリジン(vite proxy)。
 * ticket は query param ?ticket= で渡す（BE は元 URL の search を保持して DO へ転送する）。
 */
export const eventWsUrl = (eventId: string, ticket?: string): string => {
  const base = import.meta.env.PROD
    ? PROD_API_ORIGIN.replace(/^http/, "ws")
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const q = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
  return `${base}/api/events/${encodeURIComponent(eventId)}/ws${q}`;
};
