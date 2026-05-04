import { z } from "zod";

export const EnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

export type Env = z.infer<typeof EnvSchema>;

export type Bindings = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
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
