import { ColorModeScript, UIProvider } from "@yamada-ui/react";
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>tech-event-scheduler</title>
      </head>
      <body>
        <ColorModeScript />
        <UIProvider>
          <Outlet />
        </UIProvider>
      </body>
    </html>
  );
}
