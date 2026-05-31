import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ColorModeScript } from "@yamada-ui/react/core";
import { UIProvider } from "@yamada-ui/react/providers/ui-provider";
import type { ComponentProps } from "react";
import { AppErrorBoundary } from "../components/feedback/RouteBoundaries";
import { NotFound } from "../components/feedback/NotFound";
import { config, theme } from "../lib/theme";
import type { RouterContext } from "../router-context";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      // viewport-fit=cover: Bottom Tab の env(safe-area-inset-bottom) を効かせる
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1.0, viewport-fit=cover",
      },
      { title: "tech-event-scheduler" },
    ],
  }),
  component: RootComponent,
  errorComponent: AppErrorBoundary,
  notFoundComponent: NotFound,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <ColorModeScript />
        <QueryClientProvider client={queryClient}>
          {/* extendTheme の結果は有効な theme だが exactOptionalPropertyTypes 下で
              UIProvider の theme prop と深い型不一致になるため prop 型へキャスト。 */}
          <UIProvider
            theme={theme as NonNullable<ComponentProps<typeof UIProvider>["theme"]>}
            config={config}
          >
            <Outlet />
          </UIProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
