import type { FullSnapshot } from "@app/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import type { ApiClient } from "../../api-client";
import { unwrap } from "../../api-error";
import { qk } from "../../query";
import { ServerClock } from "../clock";
import { PendingQueue } from "../pending";
import { LiveSocket } from "../socket";
import { LiveStore } from "../store";

interface LiveContextValue {
  store: LiveStore;
  socket: LiveSocket | null;
  clock: ServerClock;
  pending: PendingQueue;
}
const Ctx = createContext<LiveContextValue | null>(null);

export const useLiveContext = (): LiveContextValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLiveContext outside LiveProvider");
  return v;
};

// events.$eventId.tsx で1回 mount。初期 snapshot は loader が prefetch 済み。
// m2: store/clock/pending は SSR でも構築（socket だけ client mount）。
// M5: apiClient は context 由来を受け取り resync を loader と同一 fetcher に統一。
export function LiveProvider({
  eventId,
  apiClient,
  children,
}: {
  eventId: string;
  apiClient: ApiClient;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const value = useMemo<LiveContextValue>(() => {
    const initial = qc.getQueryData<FullSnapshot>(qk.eventLive(eventId));
    const store = new LiveStore(
      initial ?? {
        version: 0,
        serverNowMs: Date.now(),
        timers: [],
        counters: [],
        modules: [],
        presence: { count: 0 },
      },
    );
    const clock = new ServerClock();
    if (initial) clock.sync(initial.serverNowMs);
    const pending = new PendingQueue();
    return { store, socket: null, clock, pending };
  }, [eventId, qc]);

  useEffect(() => {
    const { store, clock } = value;
    const resync = async () => {
      const fresh = await qc.fetchQuery({
        queryKey: qk.eventLive(eventId),
        staleTime: 0,
        queryFn: async () =>
          unwrap<FullSnapshot>(
            await apiClient.api.events[":eventId"].live.$get({
              param: { eventId },
            }),
          ),
      });
      clock.sync(fresh.serverNowMs);
      store.applySnapshot(fresh);
    };
    const socket = new LiveSocket(eventId, store, clock, resync, apiClient);
    value.socket = socket;
    socket.start();
    return () => {
      socket.stop();
      value.socket = null;
    };
  }, [value, eventId, qc, apiClient]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
