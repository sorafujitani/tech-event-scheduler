import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error";

export const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) =>
          err instanceof ApiError && (err.status === 401 || err.status === 403)
            ? false
            : count < 2,
      },
    },
  });

export const qk = {
  events: () => ["events"] as const,
  event: (id: string) => ["events", id] as const,
  eventLive: (id: string) => ["events", id, "live"] as const, // staleTime:Infinity。LiveStore が権威
};
