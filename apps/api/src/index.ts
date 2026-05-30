import "temporal-polyfill/global";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { getAuth } from "./auth";
import { onError } from "./errors";
import type { Bindings } from "./env";
import { eventRoutes } from "./routes/events";
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
  .on(["GET", "POST"], "/auth/*", (c) => getAuth(c.env).handler(c.req.raw))
  .route("/events", eventRoutes); // requireSession を内部適用（AuthedEnv）
// Phase2: .route("/public", publicRoutes) / export { EventRoom }

app.onError(onError);

export type AppType = typeof app;
export default app;
export { EventRoom } from "./durable/event-room"; // DO クラスを main から export
