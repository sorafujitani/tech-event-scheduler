import { z } from "zod";

export const EnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  // Public origin of the web Worker (no trailing slash). Used for CORS allow-list
  // and better-auth trustedOrigins. e.g. "https://tech-event-scheduler-web.<account>.workers.dev"
  WEB_ORIGIN: z.url(),
  // Registrable parent domain shared by api+web subdomains. Empty/"localhost" disables
  // cross-subdomain cookies (single-origin dev). e.g. "fujitanisora0414.workers.dev"
  COOKIE_DOMAIN: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

export type Bindings = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  WEB_ORIGIN: string;
  COOKIE_DOMAIN: string;
  DB: D1Database;
};

const cache = new WeakMap<Bindings, Env>();

export const validateEnv = (raw: Bindings): Env => {
  const hit = cache.get(raw);
  if (hit) return hit;
  const env = EnvSchema.parse(raw);
  cache.set(raw, env);
  return env;
};
