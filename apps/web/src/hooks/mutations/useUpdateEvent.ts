import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api-client";
import { unwrap } from "../../lib/api-error";
import { qk } from "../../lib/query";

type PatchEventInput = {
  title?: string;
  publicSlug?: string | null;
  externalUrl?: string | null;
  startsAtMs?: number | null;
};

// A(定義系): Query 楽観更新 + invalidate（WS では流れない）。
export const useUpdateEvent = (eventId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PatchEventInput) =>
      unwrap(
        await api().api.events[":eventId"].$patch({
          param: { eventId },
          json: input,
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.event(eventId) }),
  });
};
