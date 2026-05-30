import type { AttendanceEventKind } from "@app/shared";

/** カウンタ操作の write-ahead ログ 1 件。globalSeq 昇順で FIFO。 */
export interface WalEntry {
  id: string;
  globalSeq: number;
  counterId: string;
  kind: AttendanceEventKind;
  delta: number;
  seq: number;
  valueAfter: number;
  idempotencyKey: string;
  actedByUserId: string | null;
  actedAtMs: number;
}

/**
 * counter ごとの最終 entry（最大 seq）を返す。WAL は globalSeq 昇順 FIFO のため
 * 後勝ちで上書きすれば counter ごとの最新 valueAfter/seq が得られる。
 */
export function lastPerCounter(entries: WalEntry[]): WalEntry[] {
  const byCounter = new Map<string, WalEntry>();
  for (const e of entries) byCounter.set(e.counterId, e);
  return [...byCounter.values()];
}
