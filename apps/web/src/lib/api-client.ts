import type { AppType } from "@app/api/types";
import { hc } from "hono/client";

export type ApiClient = ReturnType<typeof hc<AppType>>;

export type ApiClientOptions = {
  origin?: string;
  fetch?: typeof fetch;
};

export const createApiClient = ({
  origin = "",
  fetch: customFetch,
}: ApiClientOptions = {}): ApiClient =>
  hc<AppType>(origin, {
    fetch: customFetch ?? globalThis.fetch.bind(globalThis),
  });
