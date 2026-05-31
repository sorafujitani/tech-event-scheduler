import { useMutation } from "@tanstack/react-query";
import { api, idempotencyHeader } from "../../lib/api-client";
import { unwrap } from "../../lib/api-error";
import { useLiveContext } from "../../lib/live/react/LiveProvider";

type CounterRes = {
  counter: { counterId: string; value: number; seq: number } | null;
  version: number;
};

// B(ライブ系): 楽観 overlay(PendingQueue) + DO 確定値。Query は触らない。M1: Idempotency-Key 必須。
export const useAdjustCounter = (eventId: string, counterId: string) => {
  const { store, pending } = useLiveContext();
  return useMutation({
    mutationFn: async (delta: number) =>
      unwrap<CounterRes>(
        await api().api.events[":eventId"].counters[":counterId"].adjust.$post({
          param: { eventId, counterId },
          json: { delta },
          header: idempotencyHeader(),
        }),
      ),
    onMutate: (delta: number) => ({
      opId: pending.applyOptimisticCounter(counterId, delta),
    }),
    onSuccess: (data, _delta, ctx) => {
      if (data.counter)
        store.applyConfirmedCounter(
          counterId,
          data.counter.value,
          data.counter.seq,
        );
      pending.settle(ctx.opId);
    },
    onError: (_e, _delta, ctx) => {
      if (ctx) pending.rollback(ctx.opId);
    },
  });
};

export const useResetCounter = (eventId: string, counterId: string) => {
  const { store } = useLiveContext();
  return useMutation({
    mutationFn: async () =>
      unwrap<CounterRes>(
        await api().api.events[":eventId"].counters[":counterId"].reset.$post({
          param: { eventId, counterId },
          header: idempotencyHeader(),
        }),
      ),
    onSuccess: (data) => {
      if (data.counter)
        store.applyConfirmedCounter(
          counterId,
          data.counter.value,
          data.counter.seq,
        );
    },
  });
};
