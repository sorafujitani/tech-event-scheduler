import type { ApiClient } from "../api-client";
import { unwrap } from "../api-error";

// C1/M5: ticket 取得は context.apiClient の RPC アクセサ経由（401 は onUnauthorized へ）。
export const fetchWsTicket = async (
  eventId: string,
  apiClient: ApiClient,
): Promise<string> => {
  const res = await apiClient.api.events[":eventId"]["ws-ticket"].$post({
    param: { eventId },
  });
  const data = await unwrap<{ ticket: string }>(res);
  return data.ticket;
};
