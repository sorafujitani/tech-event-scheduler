import "temporal-polyfill/global";

import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { RouteError } from "./components/feedback/RouteBoundaries";
import { RouteSpinner } from "./components/feedback/Skeletons";
import { authClient } from "./lib/auth-client";
import {
  createApiClient,
  createAuthFetch,
  setupApiClient,
} from "./lib/api-client";
import { makeQueryClient } from "./lib/query";
import { createSessionResolver } from "./lib/session";
import { createSsrClientOptions } from "./lib/ssr-client";
import type { ApiClientOptions } from "./lib/api-client";
import type { RouterContext } from "./router-context";
import { routeTree } from "./routeTree.gen";

// SSR=service binding/localhost fetch(+Cookie 転送) / browser=オリジン直 fetch(credentials:"include")。
// createIsomorphicFn の .server 実装と server-only import(ssr-client→cloudflare:workers)は
// Start の vite plugin がクライアントバンドルから除去する。
const resolveClientOptions = createIsomorphicFn()
  .server((): ApiClientOptions => createSsrClientOptions())
  .client((): ApiClientOptions => ({}));

export const getRouter = () => {
  const options = resolveClientOptions();
  const apiClient = createApiClient(options);
  const authFetch = createAuthFetch(options);
  const queryClient = makeQueryClient();

  const context: RouterContext = {
    apiClient,
    queryClient,
    getSession: createSessionResolver({
      authFetch,
      ssr: Boolean(import.meta.env.SSR),
    }),
  };

  const router = createRouter({
    routeTree,
    context,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0, // 鮮度は Query 戦略に委ねる
    defaultPendingComponent: RouteSpinner,
    defaultErrorComponent: RouteError,
    scrollRestoration: true,
  });

  // 401 グローバル捕捉（browser のみ実体動作）。ログイン誘導は router 経由。
  if (!import.meta.env.SSR) {
    setupApiClient(() => {
      void authClient.signOut();
      void router.navigate({ to: "/login" });
    });
  }
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
