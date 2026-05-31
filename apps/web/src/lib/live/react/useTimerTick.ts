import { remainingMs, type TimerSnapshot } from "@app/shared";
import { useEffect, useState } from "react";
import { useLiveContext } from "./LiveProvider";

/** active(=running) のみ 1s interval で再描画し、ServerClock 基準の now を返す（m1）。 */
export const useServerNow = (active: boolean): number => {
  const { clock } = useLiveContext();
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return clock.serverNow();
};

/** 残り ms（通信なし・端末時計非依存）。running のみ毎秒更新。 */
export const useRemainingMs = (
  snapshot: TimerSnapshot | undefined,
): number | null => {
  const now = useServerNow(snapshot?.status === "running");
  if (!snapshot) return null;
  return remainingMs(snapshot, now);
};
