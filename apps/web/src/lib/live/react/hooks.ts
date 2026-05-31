import { useCallback, useSyncExternalStore } from "react";
import type { ConnectionState } from "../socket";
import type { CounterState } from "../store";
import { useLiveContext } from "./LiveProvider";
import type { TimerSnapshot } from "@app/shared";

export const useTimer = (id: string): TimerSnapshot | undefined => {
  const { store } = useLiveContext();
  return useSyncExternalStore(
    useCallback((cb) => store.subscribeTimer(id, cb), [store, id]),
    useCallback(() => store.getTimer(id), [store, id]),
    useCallback(() => store.getTimer(id), [store, id]), // m2: SSR 安定値
  );
};

export const useCounter = (id: string): CounterState | undefined => {
  const { store } = useLiveContext();
  return useSyncExternalStore(
    useCallback((cb) => store.subscribeCounter(id, cb), [store, id]),
    useCallback(() => store.getCounter(id), [store, id]),
    useCallback(() => store.getCounter(id), [store, id]),
  );
};

// timers Map 全体（counter/presence 変更では timers 参照不変 → 再描画しない粒度）。
export const useTimers = (): ReadonlyMap<string, TimerSnapshot> => {
  const { store } = useLiveContext();
  return useSyncExternalStore(
    useCallback((cb) => store.subscribeGlobal(cb), [store]),
    useCallback(() => store.getState().timers, [store]),
    useCallback(() => store.getState().timers, [store]),
  );
};

/** 確定カウンタ値 + 楽観 overlay を合成した表示値。 */
export const useOptimisticCounterValue = (id: string): number => {
  const { pending } = useLiveContext();
  const confirmed = useCounter(id)?.value ?? 0;
  const overlay = useSyncExternalStore(
    useCallback((cb) => pending.subscribe(cb), [pending]),
    useCallback(() => pending.getOverlay(id), [pending, id]),
    useCallback(() => pending.getOverlay(id), [pending, id]),
  );
  return Math.max(0, confirmed + overlay);
};

export const usePresence = (): number => {
  const { store } = useLiveContext();
  return useSyncExternalStore(
    useCallback((cb) => store.subscribeGlobal(cb), [store]),
    useCallback(() => store.getPresence(), [store]),
    useCallback(() => store.getPresence(), [store]),
  );
};

export const useConnectionState = (): ConnectionState => {
  const { socket } = useLiveContext();
  return useSyncExternalStore(
    useCallback(
      (cb) => socket?.subscribeState(cb) ?? (() => {}),
      [socket],
    ),
    useCallback(() => socket?.getStateValue() ?? "connecting", [socket]),
    () => "connecting", // m2: SSR は socket null → "connecting" 固定
  );
};
