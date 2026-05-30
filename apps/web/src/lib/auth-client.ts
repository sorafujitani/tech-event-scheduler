import { createAuthClient } from "better-auth/react";

// In prod the browser must hit the api Worker on its own subdomain (CORS +
// cross-subdomain cookies, see apps/api/src/auth.ts). In dev the vite proxy
// forwards /api/auth/* to the local api Worker, so a relative URL is correct.
const PROD_API_ORIGIN = "https://tech-event-scheduler-api.fujitanisora0414.workers.dev";

const baseURL = import.meta.env.PROD
  ? `${PROD_API_ORIGIN}/api/auth`
  : "/api/auth";

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signOut, useSession } = authClient;
