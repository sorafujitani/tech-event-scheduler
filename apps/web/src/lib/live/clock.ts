// サーバー権威時刻（design §5.3 clientSkew の performance.now アンカー精緻化・m1）。
// remainingMs に渡す nowMs は常に serverNow() 由来（端末時計非依存）。
export class ServerClock {
  private anchorPerf = 0;
  private anchorServerMs = 0;
  private hasAnchor = false;

  /** serverNowMs 受信のたびに再アンカー（= clientSkew の再補正）。 */
  sync(serverNowMs: number): void {
    this.anchorPerf = performance.now();
    this.anchorServerMs = serverNowMs;
    this.hasAnchor = true;
  }

  /** 端末時計非依存のサーバー now 推定。 */
  serverNow(): number {
    if (!this.hasAnchor) return Date.now();
    return this.anchorServerMs + (performance.now() - this.anchorPerf);
  }
}
