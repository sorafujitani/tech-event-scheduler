import type { ScheduleItemKind } from "@app/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api-client";
import { unwrap } from "../../lib/api-error";
import { qk } from "../../lib/query";

type CreateItemInput = {
  title: string;
  plannedDurationSec: number;
  kind?: ScheduleItemKind;
};

type PatchItemInput = {
  itemId: string;
  patch: {
    title?: string;
    plannedDurationSec?: number;
    kind?: ScheduleItemKind;
  };
};

// A(定義系): schedule_item は event 詳細に含まれるため qk.event を invalidate。
export const useSchedule = (eventId: string) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.event(eventId) });

  const create = useMutation({
    mutationFn: async (input: CreateItemInput) =>
      unwrap(
        await api().api.events[":eventId"].schedule.$post({
          param: { eventId },
          json: input,
        }),
      ),
    onSettled: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ itemId, patch }: PatchItemInput) =>
      unwrap(
        await api().api.events[":eventId"].schedule[":itemId"].$patch({
          param: { eventId, itemId },
          json: patch,
        }),
      ),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (itemId: string) =>
      unwrap(
        await api().api.events[":eventId"].schedule[":itemId"].$delete({
          param: { eventId, itemId },
        }),
      ),
    onSettled: invalidate,
  });

  const reorder = useMutation({
    mutationFn: async (orderedItemIds: string[]) =>
      unwrap(
        await api().api.events[":eventId"].schedule.reorder.$post({
          param: { eventId },
          json: { orderedItemIds },
        }),
      ),
    onSettled: invalidate,
  });

  return { create, update, remove, reorder };
};

export type UseSchedule = ReturnType<typeof useSchedule>;
