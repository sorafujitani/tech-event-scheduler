import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "./lib/api-client";

export interface SessionContext {
  userId: string;
  email: string;
  name: string;
}

export interface RouterContext {
  /** 実行環境(SSR Worker / browser)に合わせて構築済みの API クライアント */
  apiClient: ApiClient;
  /** SSR loader prefetch / mutation 無効化の対象 */
  queryClient: QueryClient;
  /** beforeLoad で解決。SSR=service binding 経由の素 fetch /browser=authClient.getSession(M4) */
  getSession: () => Promise<SessionContext | null>;
}
