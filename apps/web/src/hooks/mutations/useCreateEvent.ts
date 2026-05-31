import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { api } from "../../lib/api-client";
import { unwrap } from "../../lib/api-error";
import type { CreateEventInput } from "../../lib/api-types";
import { qk } from "../../lib/query";

type CreateEventRes = { eventId: string };

export const useCreateEvent = () => {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async (input: CreateEventInput) =>
      unwrap<CreateEventRes>(await api().api.events.$post({ json: input })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.events() });
      // 詳細ページは Phase4。作成後は一覧へ戻す（Phase4 で /events/:eventId へ変更）。
      await router.navigate({ to: "/events" });
    },
  });
};
