import "temporal-polyfill/global";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { getAuth } from "./auth";
import type { Bindings } from "./env";
import { healthRoutes } from "./routes/health";

const app = new Hono<{ Bindings: Bindings }>()
  .basePath("/api")
  .use(secureHeaders())
  .use((c, next) =>
    cors({
      origin: c.env.WEB_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      // Idempotency-Key は timer/counter write の冪等性に必須（契約 M1）。
      allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      // prod は api サブドメイン直叩き＝write ごとに preflight。キャッシュで体感遅延を抑える（m4）。
      maxAge: 86400,
    })(c, next),
  )
  .route("/health", healthRoutes)
  .on(["GET", "POST"], "/auth/*", (c) =>
    getAuth(c.env).handler(c.req.raw),
  );

export type AppType = typeof app;
export default app;
