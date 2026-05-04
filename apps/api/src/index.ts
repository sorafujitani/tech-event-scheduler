import "temporal-polyfill/global";

import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { getAuth } from "./auth";
import type { Bindings } from "./env";
import { healthRoutes } from "./routes/health";

const app = new Hono<{ Bindings: Bindings }>()
  .basePath("/api")
  .use(secureHeaders())
  .route("/health", healthRoutes)
  .on(["GET", "POST"], "/auth/*", (c) =>
    getAuth(c.env).handler(c.req.raw),
  );

export type AppType = typeof app;
export default app;
