// 楽観更新の保留キュー（MVP: カウンタ delta の overlay のみ）。
// タイマー操作はボタン spinner + サーバー確定 status + 409 トーストで扱い、
// 楽観 status overlay / 自動再送は Should 精緻化として後続フェーズへ（design §4.5）。
type Listener = () => void;

export class PendingQueue {
  private overlay = new Map<string, number>(); // counterId -> 保留 delta 合計
  private ops = new Map<string, { counterId: string; delta: number }>();
  private listeners = new Set<Listener>();

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** 表示用: 確定値 + 保留 delta（下限0）。 */
  optimisticValue(counterId: string, confirmed: number): number {
    return Math.max(0, confirmed + (this.overlay.get(counterId) ?? 0));
  }
  getOverlay = (counterId: string): number => this.overlay.get(counterId) ?? 0;

  /** 楽観 delta を積む。返り値の opId を settle/rollback に渡す。 */
  applyOptimisticCounter(counterId: string, delta: number): string {
    const opId = crypto.randomUUID();
    this.ops.set(opId, { counterId, delta });
    this.overlay.set(counterId, (this.overlay.get(counterId) ?? 0) + delta);
    this.emit();
    return opId;
  }

  // 成功（確定値は store.applyConfirmedCounter 済み）/失敗いずれも overlay を相殺して除去。
  settle(opId: string): void {
    this.remove(opId);
  }
  rollback(opId: string): void {
    this.remove(opId);
  }

  private remove(opId: string): void {
    const op = this.ops.get(opId);
    if (!op) return;
    this.ops.delete(opId);
    const next = (this.overlay.get(op.counterId) ?? 0) - op.delta;
    if (next === 0) this.overlay.delete(op.counterId);
    else this.overlay.set(op.counterId, next);
    this.emit();
  }
}
