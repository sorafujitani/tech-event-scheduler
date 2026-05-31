import type { MemberRole } from "@app/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api-client";
import { unwrap } from "../../lib/api-error";
import { qk } from "../../lib/query";

// A(定義系): members は event 詳細に含まれるため qk.event を invalidate。
export const useMembers = (eventId: string) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.event(eventId) });

  const assign = useMutation({
    mutationFn: async (input: { userId: string; role: MemberRole }) =>
      unwrap(
        await api().api.events[":eventId"].members.$post({
          param: { eventId },
          json: input,
        }),
      ),
    onSettled: invalidate,
  });

  const setRole = useMutation({
    mutationFn: async (input: { userId: string; role: MemberRole }) =>
      unwrap(
        await api().api.events[":eventId"].members[":userId"].$patch({
          param: { eventId, userId: input.userId },
          json: { role: input.role },
        }),
      ),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await api().api.events[":eventId"].members[":userId"].$delete({
          param: { eventId, userId },
        }),
      ),
    onSettled: invalidate,
  });

  return { assign, setRole, remove };
};
