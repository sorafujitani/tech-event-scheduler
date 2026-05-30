import type { AppType } from "@app/api/types";
import { hc } from "hono/client";

export type ApiClient = ReturnType<typeof hc<AppType>>;

// Production api Worker hostname. In dev (vite proxy), origin is "" so the
// browser keeps the request on its own port and vite forwards /api/* to the
// local api Worker. Cookies stay on a single origin in dev — no CORS dance.
const PROD_API_ORIGIN = "https://tech-event-scheduler-api.fujitanisora0414.workers.dev";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const browserOrigin = (): string =>
  import.meta.env.PROD ? PROD_API_ORIGIN : "";

const browserFetch: Fetcher = (input, init) =>
  globalThis.fetch(input, { ...init, credentials: "include" });

export type ApiClientOptions = {
  /** Override origin (e.g. for SSR loaders). Default: browser environment. */
  origin?: string;
  /**
   * Override fetch. SSR loaders should pass `env.API.fetch.bind(env.API)`
   * (service binding) for intra-Worker calls. Browser callers can leave this
   * unset to get the default credential-including fetch.
   */
  fetch?: Fetcher;
};

export const createApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const origin = options.origin ?? browserOrigin();
  const customFetch = options.fetch ?? browserFetch;
  return hc<AppType>(origin, { fetch: customFetch });
};
