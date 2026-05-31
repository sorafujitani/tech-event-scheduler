import type { FullSnapshot, LiveMessage, TimerSnapshot } from "@app/shared";

export type CounterState = {
  counterId: string;
  value: number;
  seq: number;
  capacity: number | null;
};

export type ResyncReason = "gap" | "visibility" | "reconnect";

export interface LiveState {
  version: number;
  serverNowMs: number;
  timers: ReadonlyMap<string, TimerSnapshot>;
  counters: ReadonlyMap<string, CounterState>;
  presence: number;
  lastResyncReason: ResyncReason | null;
}
type Listener = () => void;

export class LiveStore {
  private state: LiveState;
  private globalListeners = new Set<Listener>();
  private timerListeners = new Map<string, Set<Listener>>();
  private counterListeners = new Map<string, Set<Listener>>();
  /** ギャップ検知時、socket に GET /live フル再取得を要求。 */
  onResyncNeeded?: (reason: ResyncReason) => void;

  constructor(initial: FullSnapshot) {
    this.state = fromSnapshot(initial);
  }

  // --- 読み取り（useSyncExternalStore getSnapshot 群）。Map 内の同一参照を返す ---
  getState = (): LiveState => this.state;
  getTimer = (id: string): TimerSnapshot | undefined => this.state.timers.get(id);
  getCounter = (id: string): CounterState | undefined =>
    this.state.counters.get(id);
  getVersion = (): number => this.state.version;
  getPresence = (): number => this.state.presence;

  // --- 購読（粒度別）---
  subscribeGlobal = (l: Listener) => this.add(this.globalListeners, l);
  subscribeTimer = (id: string, l: Listener) =>
    this.add(this.mapSet(this.timerListeners, id), l);
  subscribeCounter = (id: string, l: Listener) =>
    this.add(this.mapSet(this.counterListeners, id), l);

  /**
   * WS 1メッセージ受信。version 順厳守:
   *  snapshot → 置換 / <=cur → 冪等無視 / ==cur+1 → 差分適用 / >cur+1 → ギャップ→resync 要求（差分破棄）。
   */
  applyMessage(msg: LiveMessage): void {
    if (msg.kind === "snapshot") {
      this.applySnapshot(msg.payload);
      return;
    }
    const cur = this.state.version;
    if (msg.version <= cur) return;
    if (msg.version !== cur + 1) {
      this.requestResync("gap");
      return;
    }
    this.applyDelta(msg);
  }

  /** GET /live の結果で全置換（再同期の着地）。 */
  applySnapshot(snap: FullSnapshot): void {
    this.state = fromSnapshot(snap);
    this.notifyAll();
  }

  /** POST 応答からの確定カウンタ反映（version 非干渉・seq ガード）。WS broadcast と冪等。 */
  applyConfirmedCounter(counterId: string, value: number, seq: number): void {
    const prev = this.state.counters.get(counterId);
    if (prev && seq <= prev.seq) return;
    const counters = new Map(this.state.counters);
    counters.set(counterId, {
      counterId,
      value,
      seq,
      capacity: prev?.capacity ?? null,
    });
    this.state = { ...this.state, counters };
    this.notifyCounter(counterId);
  }

  private applyDelta(msg: Exclude<LiveMessage, { kind: "snapshot" }>): void {
    switch (msg.kind) {
      case "timer": {
        const timers = new Map(this.state.timers);
        timers.set(msg.payload.id, msg.payload);
        this.state = {
          ...this.state,
          version: msg.version,
          serverNowMs: msg.serverNowMs,
          timers,
        };
        this.notifyGlobal();
        this.notifyTimer(msg.payload.id);
        return;
      }
      case "counter": {
        // M3: counter variant に serverNowMs は無い。
        const counters = new Map(this.state.counters);
        const prev = counters.get(msg.payload.counterId);
        if (prev && msg.payload.seq <= prev.seq) {
          this.state = { ...this.state, version: msg.version };
          this.notifyGlobal();
          return;
        }
        counters.set(msg.payload.counterId, {
          counterId: msg.payload.counterId,
          value: msg.payload.value,
          seq: msg.payload.seq,
          capacity: prev?.capacity ?? null,
        });
        this.state = { ...this.state, version: msg.version, counters };
        this.notifyGlobal();
        this.notifyCounter(msg.payload.counterId);
        return;
      }
      case "schedule": {
        const timers = new Map(msg.payload.items.map((t) => [t.id, t]));
        this.state = { ...this.state, version: msg.version, timers };
        this.notifyGlobal();
        this.notifyAllTimers();
        return;
      }
      case "presence": {
        this.state = {
          ...this.state,
          version: msg.version,
          presence: msg.payload.count,
        };
        this.notifyGlobal();
        return;
      }
      default: {
        const exhaustive: never = msg;
        void exhaustive; // variant 追加でコンパイルエラー
      }
    }
  }

  private requestResync(reason: ResyncReason): void {
    this.state = { ...this.state, lastResyncReason: reason };
    this.notifyGlobal();
    this.onResyncNeeded?.(reason);
  }

  // --- 通知 ---
  private notifyGlobal() {
    this.globalListeners.forEach((l) => l());
  }
  private notifyTimer(id: string) {
    this.timerListeners.get(id)?.forEach((l) => l());
  }
  private notifyCounter(id: string) {
    this.counterListeners.get(id)?.forEach((l) => l());
  }
  private notifyAllTimers() {
    this.timerListeners.forEach((s) => s.forEach((l) => l()));
  }
  private notifyAll() {
    this.notifyGlobal();
    this.notifyAllTimers();
    this.counterListeners.forEach((s) => s.forEach((l) => l()));
  }

  private add(set: Set<Listener>, v: Listener) {
    set.add(v);
    return () => {
      set.delete(v);
    };
  }
  private mapSet(m: Map<string, Set<Listener>>, k: string) {
    let s = m.get(k);
    if (!s) {
      s = new Set();
      m.set(k, s);
    }
    return s;
  }
}

function fromSnapshot(s: FullSnapshot): LiveState {
  return {
    version: s.version,
    serverNowMs: s.serverNowMs,
    timers: new Map(s.timers.map((t) => [t.id, t])),
    counters: new Map(
      s.counters.map((c) => [
        c.counterId,
        {
          counterId: c.counterId,
          value: c.value,
          seq: c.seq,
          capacity: c.capacity,
        },
      ]),
    ),
    presence: s.presence.count,
    lastResyncReason: null,
  };
}
