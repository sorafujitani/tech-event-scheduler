// Vibration API は iOS Safari 等で未実装のため存在チェックして呼ぶ。
export function vibrate(pattern: number | number[]): void {
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate === "function") nav.vibrate(pattern);
}

export const TAP_VIBRATION_MS = 10;
export const SOON_VIBRATION_MS = 30;
export const OVERRUN_VIBRATION_PATTERN = [60, 40, 60];
