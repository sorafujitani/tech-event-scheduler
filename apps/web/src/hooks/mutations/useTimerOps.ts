import { useMutation } from "@tanstack/react-query";
import { api, idempotencyHeader } from "../../lib/api-client";
import { unwrap } from "../../lib/api-error";

// C2: events[":eventId"].schedule[":itemId"].timer.{start,...}。M1: header に Idempotency-Key 必須。
// MVP は楽観 status overlay を持たず、確定 status は WS broadcast が store に反映する。
export const useTimerOps = (eventId: string, itemId: string) => {
  const acc = api().api.events[":eventId"].schedule[":itemId"].timer;
  const param = { eventId, itemId };

  const start = useMutation({
    mutationFn: async () =>
      unwrap(await acc.start.$post({ param, header: idempotencyHeader() })),
  });
  const pause = useMutation({
    mutationFn: async () =>
      unwrap(await acc.pause.$post({ param, header: idempotencyHeader() })),
  });
  const resume = useMutation({
    mutationFn: async () =>
      unwrap(await acc.resume.$post({ param, header: idempotencyHeader() })),
  });
  const complete = useMutation({
    mutationFn: async () =>
      unwrap(await acc.complete.$post({ param, header: idempotencyHeader() })),
  });
  const skip = useMutation({
    mutationFn: async () =>
      unwrap(await acc.skip.$post({ param, header: idempotencyHeader() })),
  });
  const extend = useMutation({
    mutationFn: async (deltaSec: number) =>
      unwrap(
        await acc.extend.$patch({
          param,
          json: { deltaSec },
          header: idempotencyHeader(),
        }),
      ),
  });

  return { start, pause, resume, complete, skip, extend };
};
