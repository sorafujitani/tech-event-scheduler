import type { FullSnapshot } from "@app/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  const base = useMemo(() => {
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
    return { store, clock, pending };
  }, [eventId, qc]);

  // socket は state に載せ、接続の生成/破棄で context 参照を変えて消費者へ伝播させる。
  const [socket, setSocket] = useState<LiveSocket | null>(null);

  useEffect(() => {
    const { store, clock } = base;
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
    const next = new LiveSocket(eventId, store, clock, resync, apiClient);
    setSocket(next);
    next.start();
    return () => {
      next.stop();
      setSocket((cur) => (cur === next ? null : cur));
    };
  }, [base, eventId, qc, apiClient]);

  const value = useMemo<LiveContextValue>(
    () => ({ ...base, socket }),
    [base, socket],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
