import { createDb } from "@app/db";
import * as schema from "@app/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { validateEnv, type Bindings } from "./env";

export type Auth = ReturnType<typeof buildAuth>;

const cache = new WeakMap<Bindings, Auth>();

export const getAuth = (bindings: Bindings): Auth => {
  const hit = cache.get(bindings);
  if (hit) return hit;
  const auth = buildAuth(bindings);
  cache.set(bindings, auth);
  return auth;
};

const buildAuth = (bindings: Bindings) => {
  const env = validateEnv(bindings);
  const db = createDb(bindings.DB);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
  });
};
