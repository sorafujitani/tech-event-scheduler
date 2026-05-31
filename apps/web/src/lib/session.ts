import type { SessionContext } from "../router-context";
import type { ApiClient } from "./api-client";
import { authClient } from "./auth-client";

type GetSessionResponse = {
  user?: { id: string; email: string; name: string };
} | null;

export const createSessionResolver =
  (deps: { apiClient: ApiClient; ssr: boolean }) =>
  async (): Promise<SessionContext | null> => {
    if (deps.ssr) {
      // M4: better-auth は /auth/* ワイルドカードで RPC アクセサに出ない。
      //     ApiClient が保持する fetch(=service binding + Cookie 転送)で /api/auth/get-session を素で叩く。
      const res = await deps.apiClient.$fetch("/api/auth/get-session", {
        method: "GET",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as GetSessionResponse;
      return data?.user
        ? {
            userId: data.user.id,
            email: data.user.email,
            name: data.user.name,
          }
        : null;
    }
    // browser: better-auth/react の軽量 session（Cookie 同梱）
    const { data } = await authClient.getSession();
    return data?.user
      ? {
          userId: data.user.id,
          email: data.user.email,
          name: data.user.name,
        }
      : null;
  };
