import { LiveMessage } from "@app/shared";
import type { ApiClient } from "../api-client";
import { eventWsUrl } from "../env";
import type { ServerClock } from "./clock";
import type { LiveStore } from "./store";
import { fetchWsTicket } from "./ticket";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

const HEARTBEAT_MS = 25_000; // app層 ping（DO Hibernation idle と両立）
const PONG_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;
const CONNECT_TIMEOUT_MS = 10_000;

const KNOWN_KINDS: ReadonlySet<string> = new Set([
  "snapshot",
  "timer",
  "counter",
  "schedule",
  "presence",
] satisfies LiveMessage["kind"][]);

export class LiveSocket {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "connecting";
  private attempt = 0;
  private closedByUs = false;
  private connectInFlight = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListeners = new Set<(s: ConnectionState) => void>();

  constructor(
    private eventId: string,
    private store: LiveStore,
    private clock: ServerClock,
    // Query refetch qk.eventLive(context.apiClient) → store.applySnapshot（M5: loader と同一 fetcher）
    private resync: () => Promise<void>,
    private apiClient: ApiClient, // M5: ticket 取得もこれ経由
  ) {
    this.store.onResyncNeeded = () => void this.resync();
  }

  start(): void {
    this.closedByUs = false;
    this.bindVisibility();
    void this.connect();
  }
  stop(): void {
    this.closedByUs = true;
    this.unbindVisibility();
    this.clearTimers();
    this.disposeWs(1000, "client-stop");
    this.setState("offline");
  }
  subscribeState = (l: (s: ConnectionState) => void) => {
    this.stateListeners.add(l);
    return () => {
      this.stateListeners.delete(l);
    };
  };
  getStateValue = (): ConnectionState => this.state;

  // C1: cookie 第一 → close 1008/4401 観測で次回 ticket フォールバック（query param で接続）。
  // 多重呼び出し（visibility/online の同時発火）は in-flight フラグと readyState で弾く。
  private async connect(useTicket = false): Promise<void> {
    if (this.connectInFlight) return;
    if (
      this.ws?.readyState === WebSocket.CONNECTING ||
      this.ws?.readyState === WebSocket.OPEN
    ) {
      return;
    }
    this.clearTimers();
    this.disposeWs(1000, "superseded");
    this.connectInFlight = true;
    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");
    let ticket: string | undefined;
    if (useTicket) {
      try {
        ticket = await fetchWsTicket(this.eventId, this.apiClient);
      } catch {
        this.connectInFlight = false;
        this.scheduleReconnect(true);
        return;
      }
    }
    const ws = new WebSocket(eventWsUrl(this.eventId, ticket));
    this.ws = ws;
    this.connectInFlight = false;
    // 破棄済み ws のイベントを無視するため、現行 ws と一致する場合のみ処理する。
    ws.addEventListener("open", () => {
      if (this.ws === ws) this.onOpen();
    });
    ws.addEventListener("message", (e) => {
      if (this.ws === ws) this.onMessage(e);
    });
    ws.addEventListener("close", (e) => {
      if (this.ws === ws) this.onClose(e);
    });
    // ハンドシェイクが寡黙にハングすると onClose が来ず、readyState ガードにより
    // online/visibility 経由の connect() も素通りして再接続不能になるため打ち切る。
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (this.ws === ws && ws.readyState === WebSocket.CONNECTING) {
        ws.close(4002, "connect-timeout"); // close イベント経由で scheduleReconnect に乗る
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private onOpen(): void {
    this.clearConnectTimer();
    this.attempt = 0;
    this.setState("connected");
    this.startHeartbeat();
    void this.resync(); // 接続確立直後は必ず full snapshot（取りこぼし防止 §3.3）
  }

  private onMessage(e: MessageEvent): void {
    if (typeof e.data === "string" && e.data === "pong") {
      this.notePong();
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(e.data as string);
    } catch {
      return;
    }
    const parsed = LiveMessage.safeParse(raw);
    if (!parsed.success) {
      // 未知 kind は前方互換のため黙って無視する（version が飛べば既存の gap 検出が
      // resync する）。既知 kind の形状不正のみ full 再取得で即回復する。
      const kind =
        typeof raw === "object" && raw !== null && "kind" in raw
          ? (raw as { kind: unknown }).kind
          : undefined;
      if (typeof kind === "string" && !KNOWN_KINDS.has(kind)) return;
      void this.resync();
      return;
    }
    const msg = parsed.data;
    // M3: serverNowMs を持つのは snapshot / timer のみ。counter は持たない。
    if (msg.kind === "snapshot" || msg.kind === "timer") {
      this.clock.sync(msg.serverNowMs);
    }
    this.store.applyMessage(msg);
  }

  private onClose(e: CloseEvent): void {
    this.clearTimers();
    if (this.closedByUs) {
      this.setState("offline");
      return;
    }
    this.scheduleReconnect(e.code === 1008 || e.code === 4401); // 認可失敗は次回 ticket（C1）
  }

  private scheduleReconnect(useTicket = false): void {
    this.setState(navigator.onLine ? "reconnecting" : "offline");
    this.attempt += 1;
    const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    const delay = Math.random() * cap; // full jitter
    this.reconnectTimer = setTimeout(() => {
      if (!navigator.onLine) {
        this.setState("offline"); // online イベントで再開
        return;
      }
      void this.connect(useTicket);
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send("ping");
      // pong 待ちを多重に積まない（未応答のまま次の ping が来ても timer は1本）。
      this.pongTimer ??= setTimeout(
        () => this.ws?.close(4000, "pong-timeout"),
        PONG_TIMEOUT_MS,
      );
    }, HEARTBEAT_MS);
  }
  private notePong(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  // visibilitychange / pageshow(bfcache) / online（design §5.4 iOS Safari）
  private onVisible = (): void => {
    if (document.visibilityState !== "visible") return;
    void this.resync().then(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        this.attempt = 0;
        void this.connect();
      }
    });
  };
  private onPageShow = (e: PageTransitionEvent): void => {
    if (e.persisted) this.onVisible();
  };
  private onOnline = (): void => {
    this.attempt = 0;
    void this.connect();
  };
  private onOffline = (): void => this.setState("offline");

  private bindVisibility(): void {
    document.addEventListener("visibilitychange", this.onVisible);
    globalThis.addEventListener("pageshow", this.onPageShow);
    globalThis.addEventListener("online", this.onOnline);
    globalThis.addEventListener("offline", this.onOffline);
  }
  private unbindVisibility(): void {
    document.removeEventListener("visibilitychange", this.onVisible);
    globalThis.removeEventListener("pageshow", this.onPageShow);
    globalThis.removeEventListener("online", this.onOnline);
    globalThis.removeEventListener("offline", this.onOffline);
  }
  private setState(s: ConnectionState): void {
    if (s !== this.state) {
      this.state = s;
      this.stateListeners.forEach((l) => l(s));
    }
  }
  /** 現行 ws を手放す。以降この ws のイベントは connect 時のガードで無視される。 */
  private disposeWs(code: number, reason: string): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    if (
      ws.readyState === WebSocket.CONNECTING ||
      ws.readyState === WebSocket.OPEN
    ) {
      ws.close(code, reason);
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.pongTimer = null;
    this.reconnectTimer = null;
    this.clearConnectTimer();
  }
}
