import { createAuthClient } from "better-auth/react";
import { authBaseURL } from "./env";

// origin 分岐は env.ts に集約（重複定数を排除）。dev は相対 /api/auth（vite proxy）、
// prod は api サブドメイン直（クロスサブドメイン cookie、apps/api/src/auth.ts 参照）。
export const authClient = createAuthClient({
  baseURL: authBaseURL(),
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signOut, useSession } = authClient;
