export interface CounterState {
  value: number;
  seq: number;
  capacity: number | null;
  name: string;
}

export function applyAdjust(
  c: CounterState,
  delta: number,
): { next: CounterState; valueAfter: number } {
  const value = Math.max(0, c.value + delta); // 下限 0 クランプ
  return { next: { ...c, value, seq: c.seq + 1 }, valueAfter: value };
}

export function applyReset(c: CounterState): {
  next: CounterState;
  prev: number;
} {
  // 読み(prev)と書き(value=0)を DO 内で原子化（adjust の擬似 reset を使わない）
  return { next: { ...c, value: 0, seq: c.seq + 1 }, prev: c.value };
}
