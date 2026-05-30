import { createDb } from "@app/db";
import type { LiveMessage } from "@app/shared";
import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../env";
import { statusForCode } from "../errors";
import { verifyWsTicket } from "../lib/ticket";
import { flushCounterWal, listCounters } from "../repo/counters";
import { newId } from "../repo/ids";
import { applyTimerTransition, listItems } from "../repo/schedule";
import {
  applyAdjust,
  applyReset,
  type CounterState,
} from "./counter-core";
import {
  INTERNAL_COMMAND_PATH,
  INTERNAL_WS_PATH,
  type RoomCommand,
  type RoomResponse,
} from "./protocol";
import {
  counterMessage,
  presenceMessage,
  snapshotMessage,
  timerMessage,
  toTimerSnapshot,
  type RoomStateView,
} from "./snapshot";
import {
  complete,
  extend,
  IllegalTransition,
  pause,
  resume,
  type RoomTimer,
  skip,
  start,
} from "./timer-machine";
import type { WalEntry } from "./wal";

interface RoomMeta {
  eventId: string | null;
  version: number;
}
interface ConnMeta {
  userId: string;
  role: "owner" | "manager";
  joinedAtMs: number;
}

const FLUSH_DEBOUNCE_MS = 5_000;
const RECENT_IDEMP_CAP = 1024;

export class EventRoom extends DurableObject<Bindings> {
  private eventId: string | null = null;
  private version = 0;
  private timers = new Map<string, RoomTimer>();
  private counters = new Map<string, CounterState>();
  private recentIdemp = new Set<string>();
  private walGlobalSeq = 0;
  private flushDueMs: number | null = null;
  private hydrated = false;
  // 並行リクエストの read-modify-write を直列化する非破壊的 mutex（promise chain）。
  // blockConcurrencyWhile は throw 時に DO をリセットするため不可。
  private mutex: Promise<void> = Promise.resolve();

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mutex.then(fn);
    this.mutex = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(() => this.restore());
  }

  // --- 起動復元（storage が一次ソース）---
  private async restore(): Promise<void> {
    const meta = await this.ctx.storage.get<RoomMeta>("meta:room");
    if (meta) {
      this.eventId = meta.eventId;
      this.version = meta.version;
    }
    const timers = await this.ctx.storage.list<RoomTimer>({ prefix: "timer:" });
    for (const t of timers.values()) this.timers.set(t.id, t);
    const counters = await this.ctx.storage.list<CounterState & { id: string }>({
      prefix: "counter:",
    });
    for (const [key, c] of counters)
      this.counters.set(key.slice("counter:".length), c);
    const wal = await this.ctx.storage.list<WalEntry>({ prefix: "wal:" });
    if (wal.size > 0) {
      this.walGlobalSeq = Math.max(...[...wal.values()].map((e) => e.globalSeq));
      this.flushDueMs = Date.now();
    }
    if (this.timers.size > 0 || this.counters.size > 0) this.hydrated = true;
    await this.reconcileAlarm();
  }

  // 初回起動（storage 空）のみ D1 から hydrate。eventId 確定後に実行する。
  // 並行リクエストが同時に hydrate して在メモリ値を D1 の古い値で上書きしないよう、
  // 1 度だけ走る memoized promise にする。
  private hydrationPromise: Promise<void> | null = null;
  private ensureHydrated(): Promise<void> {
    if (this.hydrated || !this.eventId) return Promise.resolve();
    if (!this.hydrationPromise) this.hydrationPromise = this.hydrate();
    return this.hydrationPromise;
  }

  private async hydrate(): Promise<void> {
    if (!this.eventId) return;
    const db = createDb(this.env.DB);
    const [items, counters] = await Promise.all([
      listItems(db, this.eventId),
      listCounters(db, this.eventId),
    ]);
    await Promise.all(
      items.map((row) => {
        // D1 は write-through で 5 列の不変条件を維持しているため RoomTimer として扱える。
        const t = {
          id: row.id,
          plannedDurationSec: row.plannedDurationSec,
          track: row.track,
          overrunNotified: false,
          status: row.status,
          actualStartedAtMs: row.actualStartedAtMs,
          accumulatedPauseMs: row.accumulatedPauseMs,
          pausedAtMs: row.pausedAtMs,
          endedAtMs: row.endedAtMs,
        } as RoomTimer;
        this.timers.set(t.id, t);
        return this.ctx.storage.put(`timer:${t.id}`, t);
      }),
    );
    await Promise.all(
      counters.map((row) => {
        const c: CounterState = {
          value: row.currentValue,
          seq: row.lastSeq,
          capacity: row.capacity,
          name: row.name,
        };
        this.counters.set(row.id, c);
        return this.ctx.storage.put(`counter:${row.id}`, { ...c, id: row.id });
      }),
    );
    this.hydrated = true;
    await this.reconcileAlarm();
  }

  private async confirmEventId(id: string): Promise<void> {
    if (this.eventId === id) return;
    this.eventId = id;
    const meta = (await this.ctx.storage.get<RoomMeta>("meta:room")) ?? {
      eventId: id,
      version: this.version,
    };
    await this.ctx.storage.put("meta:room", { ...meta, eventId: id }); // version は触らない
  }

  private async persistVersion(): Promise<void> {
    await this.ctx.storage.put("meta:room", {
      eventId: this.eventId,
      version: this.version,
    });
  }

  // --- HTTP ディスパッチ ---
  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const hdr = req.headers.get("x-event-id");
    if (hdr) await this.confirmEventId(hdr);

    if (
      req.headers.get("upgrade") === "websocket" &&
      url.pathname === INTERNAL_WS_PATH
    ) {
      return this.handleUpgrade(req);
    }
    if (url.pathname === INTERNAL_COMMAND_PATH && req.method === "POST") {
      await this.ensureHydrated();
      const cmd = (await req.json()) as RoomCommand;
      const result = await this.dispatch(cmd);
      const status = result.ok ? 200 : statusForCode(result.code);
      return Response.json(result, { status });
    }
    return new Response("not found", { status: 404 });
  }

  private async dispatch(cmd: RoomCommand): Promise<RoomResponse> {
    try {
      switch (cmd.type) {
        case "timer.start":
        case "timer.pause":
        case "timer.resume":
        case "timer.complete":
        case "timer.skip":
        case "timer.extend":
          // 並行リクエストの read-modify-write を直列化（lost update / 二重 start 防止）。
          return await this.serialize(() => this.applyTimer(cmd));
        case "counter.adjust":
        case "counter.reset":
          return await this.serialize(() => this.applyCounter(cmd));
        case "snapshot.get":
        case "sync.schedule":
        case "sync.counters":
          return this.snapshotResult();
      }
    } catch (e) {
      if (e instanceof IllegalTransition)
        return { ok: false, error: e.cause, code: "CONFLICT" };
      throw e;
    }
  }

  // --- タイマー ---
  private async applyTimer(
    cmd: Extract<RoomCommand, { type: `timer.${string}` }>,
  ): Promise<RoomResponse> {
    const idempKey = `idemp:t:${cmd.idempotencyKey}`;
    const cur = this.timers.get(cmd.itemId);
    if (!cur) return { ok: false, error: "timer not found", code: "NOT_FOUND" };
    if (await this.isApplied(cmd.idempotencyKey, idempKey)) {
      return this.timerResult(cur); // 再送は現状を返す（二重適用しない）
    }
    const now = Date.now();

    let next: RoomTimer;
    switch (cmd.type) {
      case "timer.start": {
        // 同 track に running があれば CONFLICT（判定は DO 内）
        for (const t of this.timers.values()) {
          if (t.id !== cur.id && t.track === cur.track && t.status === "running")
            return { ok: false, error: "another item is running", code: "CONFLICT" };
        }
        next = start(cur, now);
        break;
      }
      case "timer.pause":
        next = pause(cur, now);
        break;
      case "timer.resume":
        next = resume(cur, now);
        break;
      case "timer.complete":
        next = complete(cur, now);
        break;
      case "timer.skip":
        next = skip(cur, now);
        break;
      case "timer.extend":
        next = extend(cur, cmd.deltaSec);
        break;
    }

    // 順序: storage → in-memory → D1 write-through → version → idemp → broadcast（§5.2-2）
    await this.ctx.storage.put(`timer:${next.id}`, next);
    this.timers.set(next.id, next);
    await applyTimerTransition(createDb(this.env.DB), next.id, {
      status: next.status,
      actualStartedAtMs: next.actualStartedAtMs,
      accumulatedPauseMs: next.accumulatedPauseMs,
      pausedAtMs: next.pausedAtMs,
      endedAtMs: next.endedAtMs,
      plannedDurationSec: next.plannedDurationSec,
    });
    this.version++;
    await this.persistVersion();
    await this.markApplied(cmd.idempotencyKey, idempKey);
    this.broadcast(timerMessage(this.version, now, toTimerSnapshot(next)));
    await this.reconcileAlarm();
    return this.timerResult(next, now);
  }

  // --- カウンタ ---
  private async applyCounter(
    cmd: Extract<RoomCommand, { type: `counter.${string}` }>,
  ): Promise<RoomResponse> {
    const idempKey = `idemp:c:${cmd.idempotencyKey}`;
    const cur = this.counters.get(cmd.counterId);
    if (!cur)
      return { ok: false, error: "counter not found", code: "NOT_FOUND" };
    if (await this.isApplied(cmd.idempotencyKey, idempKey)) {
      return this.counterResult(cmd.counterId, cur);
    }
    const now = Date.now();

    let next: CounterState;
    let delta: number;
    let kind: "adjust" | "reset";
    if (cmd.type === "counter.adjust") {
      const r = applyAdjust(cur, cmd.delta);
      next = r.next;
      delta = cmd.delta;
      kind = "adjust";
    } else {
      const r = applyReset(cur);
      next = r.next;
      delta = -r.prev;
      kind = "reset";
    }

    // 順序: WAL → counter ミラー → 冪等 → version → broadcast（§5.5）
    const entry: WalEntry = {
      id: newId(),
      globalSeq: ++this.walGlobalSeq,
      counterId: cmd.counterId,
      kind,
      delta,
      seq: next.seq,
      valueAfter: next.value,
      idempotencyKey: cmd.idempotencyKey,
      actedByUserId: cmd.actorUserId,
      actedAtMs: now,
    };
    await this.ctx.storage.put(walKey(entry.globalSeq), entry);
    await this.ctx.storage.put(`counter:${cmd.counterId}`, {
      ...next,
      id: cmd.counterId,
    });
    this.counters.set(cmd.counterId, next);
    await this.markApplied(cmd.idempotencyKey, idempKey);
    this.version++;
    await this.persistVersion();
    this.broadcast(counterMessage(this.version, next, cmd.counterId));
    this.flushDueMs = now + FLUSH_DEBOUNCE_MS;
    await this.reconcileAlarm();
    return this.counterResult(cmd.counterId, next, now);
  }

  // --- 冪等三段（メモリ + storage、D1 unique は flush 側）---
  private async isApplied(key: string, storageKey: string): Promise<boolean> {
    if (this.recentIdemp.has(key)) return true;
    return (await this.ctx.storage.get(storageKey)) != null;
  }
  private async markApplied(key: string, storageKey: string): Promise<void> {
    this.recentIdemp.add(key);
    if (this.recentIdemp.size > RECENT_IDEMP_CAP) {
      const first = this.recentIdemp.values().next().value;
      if (first) this.recentIdemp.delete(first);
    }
    await this.ctx.storage.put(storageKey, { at: Date.now() });
  }

  // --- WebSocket（Hibernation）---
  private async handleUpgrade(req: Request): Promise<Response> {
    const meta = await this.authConn(req);
    if (!meta) return new Response("unauthorized", { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`user:${meta.userId}`]);
    server.serializeAttachment(meta);
    server.send(JSON.stringify(this.buildSnapshot()));
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  private async authConn(req: Request): Promise<ConnMeta | null> {
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
    if (ticket && this.eventId) {
      const p = await verifyWsTicket(
        this.env.BETTER_AUTH_SECRET,
        ticket,
        Date.now(),
      );
      if (p && p.eventId === this.eventId)
        return { userId: p.userId, role: p.role, joinedAtMs: Date.now() };
    }
    return null;
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    // WS 経由の状態変更は許さない。ping / resync のみ。
    const text = typeof message === "string" ? message : "";
    if (text === "ping") {
      ws.send(JSON.stringify({ kind: "pong" }));
    } else if (text === "resync") {
      ws.send(JSON.stringify(this.buildSnapshot()));
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
    this.broadcastPresence();
  }

  override async webSocketError(): Promise<void> {
    this.broadcastPresence();
  }

  // --- broadcast / snapshot ---
  private broadcast(msg: LiveMessage): void {
    const json = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(json);
    }
  }
  private broadcastPresence(): void {
    this.broadcast(
      presenceMessage(this.version, this.ctx.getWebSockets().length),
    );
  }
  private stateView(): RoomStateView {
    return {
      version: this.version,
      timers: [...this.timers.values()],
      counters: [...this.counters.entries()].map(([id, state]) => ({
        id,
        state,
      })),
      presenceCount: this.ctx.getWebSockets().length,
    };
  }
  private buildSnapshot(): LiveMessage {
    return snapshotMessage(this.stateView(), Date.now());
  }
  private snapshotResult(): RoomResponse {
    const now = Date.now();
    const msg = snapshotMessage(this.stateView(), now);
    if (msg.kind !== "snapshot")
      return { ok: false, error: "snapshot", code: "INTERNAL" };
    return {
      ok: true,
      type: "snapshot",
      version: this.version,
      serverNowMs: now,
      payload: msg.payload,
    };
  }
  private timerResult(t: RoomTimer, serverNowMs = Date.now()): RoomResponse {
    return {
      ok: true,
      type: "timer",
      version: this.version,
      serverNowMs,
      payload: toTimerSnapshot(t),
    };
  }
  private counterResult(
    counterId: string,
    c: CounterState,
    serverNowMs = Date.now(),
  ): RoomResponse {
    return {
      ok: true,
      type: "counter",
      version: this.version,
      serverNowMs,
      payload: { counterId, value: c.value, seq: c.seq },
    };
  }

  // --- alarm 多重化（overrun 期限 + flush 期限を最小値へ畳み込む）---
  private overrunDeadline(t: RoomTimer): number | null {
    if (t.status !== "running") return null;
    return t.actualStartedAtMs + t.accumulatedPauseMs + t.plannedDurationSec * 1000;
  }
  private async reconcileAlarm(): Promise<void> {
    const candidates: number[] = [];
    if (this.flushDueMs != null) candidates.push(this.flushDueMs);
    for (const t of this.timers.values()) {
      if (t.overrunNotified) continue;
      const d = this.overrunDeadline(t);
      if (d != null) candidates.push(d);
    }
    if (candidates.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...candidates));
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    if (this.flushDueMs != null && now >= this.flushDueMs) {
      await this.flushWal(now);
    }
    // overrun: running で期限到来かつ未通知 → overrunNotified を立てて broadcast（自動 done しない）。
    // 状態遷移は storage→version の順序を守るため逐次（at-least-once でも overrunNotified で冪等）。
    /* oxlint-disable no-await-in-loop */
    for (const t of this.timers.values()) {
      const d = this.overrunDeadline(t);
      if (d != null && now >= d && !t.overrunNotified) {
        const next = { ...t, overrunNotified: true };
        this.timers.set(next.id, next);
        await this.ctx.storage.put(`timer:${next.id}`, next);
        this.version++;
        await this.persistVersion();
        this.broadcast(timerMessage(this.version, now, toTimerSnapshot(next)));
      }
    }
    /* oxlint-enable no-await-in-loop */
    await this.reconcileAlarm();
  }

  private async flushWal(now: number): Promise<void> {
    const map = await this.ctx.storage.list<WalEntry>({ prefix: "wal:" });
    if (map.size === 0) {
      this.flushDueMs = null;
      return;
    }
    const keys = [...map.keys()];
    // map.values() は新規配列なので in-place sort で安全（toSorted は lib target 制約のため不使用）。
    // oxlint-disable-next-line no-array-sort
    const entries = [...map.values()].sort((a, b) => a.globalSeq - b.globalSeq);
    try {
      await flushCounterWal(createDb(this.env.DB), entries, now);
      await this.ctx.storage.delete(keys); // 全成功 → 積んだ全 entry を削除
      this.flushDueMs = null;
    } catch {
      this.flushDueMs = now + FLUSH_DEBOUNCE_MS; // 全残置で次 alarm 再送
    }
  }
}

function walKey(globalSeq: number): string {
  return `wal:${String(globalSeq).padStart(16, "0")}`;
}
