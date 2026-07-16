import type { LiveMessage } from "@app/shared";
import { verifyWsTicket } from "../lib/ticket";

export interface ConnMeta {
  userId: string;
  role: "owner" | "manager";
  joinedAtMs: number;
}

/** WS 接続の認可・受け入れ・配信。Hibernation API（ctx）を包み、DO 本体を調停に専念させる。 */
export class RoomConnections {
  constructor(
    private ctx: DurableObjectState,
    private authSecret: string,
  ) {}

  async authorize(req: Request, eventId: string | null): Promise<ConnMeta | null> {
    // 一次: api が member 認可済みで付与する x-conn-meta
    const raw = req.headers.get("x-conn-meta");
    if (raw) {
      try {
        const m = JSON.parse(raw) as { userId: string; role: "owner" | "manager" };
        return { ...m, joinedAtMs: Date.now() };
      } catch {
        /* fallthrough to ticket */
      }
    }
    // フォールバック: 署名 ticket（cookie 不達経路、C1）
    const ticket = req.headers.get("x-ws-ticket");
    if (ticket && eventId) {
      const p = await verifyWsTicket(this.authSecret, ticket, Date.now());
      if (p && p.eventId === eventId)
        return { userId: p.userId, role: p.role, joinedAtMs: Date.now() };
    }
    return null;
  }

  accept(meta: ConnMeta, snapshotJson: string): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`user:${meta.userId}`]);
    server.serializeAttachment(meta);
    server.send(snapshotJson);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(msg: LiveMessage): void {
    const json = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(json);
    }
  }

  // webSocketClose 時点の getWebSockets() は閉じたソケットを含み得るため exclude で除外する。
  count(exclude?: WebSocket): number {
    return this.ctx.getWebSockets().filter((ws) => ws !== exclude).length;
  }
}
