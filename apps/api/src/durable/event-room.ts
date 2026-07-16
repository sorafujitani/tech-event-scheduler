import { createDb } from "@app/db";
import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../env";
import { statusForCode } from "../errors";
import { log } from "../lib/log";
import { flushCounterWal, listCounters } from "../repo/counters";
import { newId } from "../repo/ids";
import { applyTimerTransition, listItems } from "../repo/schedule";
import { RoomConnections } from "./connections";
import {
  applyAdjust,
  applyReset,
  type CounterState,
} from "./counter-core";
import { IdempotencyStore } from "./idempotency";
import {
  INTERNAL_COMMAND_PATH,
  INTERNAL_WS_PATH,
  roomCommandSchema,
  type RoomCommand,
  type RoomResponse,
} from "./protocol";
import {
  counterMessage,
  presenceMessage,
  scheduleMessage,
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
  roomTimerFromRow,
  type RoomTimer,
  type TimerRow,
  skip,
  start,
} from "./timer-machine";
import type { WalEntry } from "./wal";

interface RoomMeta {
  eventId: string | null;
  version: number;
}

const FLUSH_DEBOUNCE_MS = 5_000;

export class EventRoom extends DurableObject<Bindings> {
  private eventId: string | null = null;
  private version = 0;
  private timers = new Map<string, RoomTimer>();
  private counters = new Map<string, CounterState>();
  private idemp: IdempotencyStore;
  private conns: RoomConnections;
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
    this.idemp = new IdempotencyStore(ctx.storage);
    this.conns = new RoomConnections(ctx, env.BETTER_AUTH_SECRET);
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

  // 不変条件を満たさない行は取り込まない（write-through が破れた兆候として観測に残す）。
  private timerFromRow(row: TimerRow): RoomTimer | null {
    const t = roomTimerFromRow(row);
    if (!t) log("error", "timer_row_invalid", { itemId: row.id, status: row.status });
    return t;
  }

  private async hydrate(): Promise<void> {
    if (!this.eventId) return;
    const db = createDb(this.env.DB);
    const [items, counters] = await Promise.all([
      listItems(db, this.eventId),
      listCounters(db, this.eventId),
    ]);
    await Promise.all(
      items.flatMap((row) => {
        const t = this.timerFromRow(row);
        if (!t) return [];
        this.timers.set(t.id, t);
        return [this.ctx.storage.put(`timer:${t.id}`, t)];
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

  // sync.schedule: D1 の schedule 定義（追加/削除/plannedDurationSec 等）を在メモリへ反映する。
  // 実行状態（status/actualStartedAtMs/...）は在メモリが権威なので既存 entry は上書きしない。
  private async resyncSchedule(): Promise<RoomResponse> {
    if (this.eventId) {
      const rows = await listItems(createDb(this.env.DB), this.eventId);
      const seen = new Set(rows.map((r) => r.id));
      await Promise.all(
        rows.flatMap((row) => {
          const cur = this.timers.get(row.id);
          const next: RoomTimer | null = cur
            ? { ...cur, plannedDurationSec: row.plannedDurationSec, track: row.track }
            : this.timerFromRow(row);
          if (!next) return [];
          this.timers.set(next.id, next);
          return [this.ctx.storage.put(`timer:${next.id}`, next)];
        }),
      );
      const removed = [...this.timers.keys()].filter((id) => !seen.has(id));
      await Promise.all(
        removed.map((id) => {
          this.timers.delete(id);
          return this.ctx.storage.delete(`timer:${id}`);
        }),
      );
      this.version++;
      await this.persistVersion();
      // broadcast は D1 の orderIndex 順（rows 順）で並べる。
      this.conns.broadcast(
        scheduleMessage(
          this.version,
          rows.flatMap((row) => {
            const t = this.timers.get(row.id);
            return t ? [toTimerSnapshot(t)] : [];
          }),
        ),
      );
      await this.reconcileAlarm();
    }
    return this.snapshotResult();
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
      const parsed = roomCommandSchema.safeParse(
        await req.json().catch(() => null),
      );
      if (!parsed.success) {
        const body: RoomResponse = {
          ok: false,
          error: "invalid room command",
          code: "BAD_REQUEST",
        };
        return Response.json(body, { status: statusForCode(body.code) });
      }
      const result = await this.dispatch(parsed.data);
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
        case "sync.schedule":
          // D1 の schedule 変更（追加/削除/定義変更）を在メモリへ追従させる。
          // hydrate は初回起動のみなので、起動後の REST mutation はこれで届く。
          return await this.serialize(() => this.resyncSchedule());
        case "snapshot.get":
          return this.snapshotResult();
        default: {
          const unexpected: never = cmd;
          return unexpected;
        }
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
    if (await this.idemp.isApplied(cmd.idempotencyKey, idempKey)) {
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
    try {
      await applyTimerTransition(createDb(this.env.DB), next.id, {
        status: next.status,
        actualStartedAtMs: next.actualStartedAtMs,
        accumulatedPauseMs: next.accumulatedPauseMs,
        pausedAtMs: next.pausedAtMs,
        endedAtMs: next.endedAtMs,
        plannedDurationSec: next.plannedDurationSec,
      });
    } catch (e) {
      // D1 失敗時は idemp 未マークのまま遷移を巻き戻し、同一キー再送をクリーンに成功させる
      // （巻き戻さないと再送が IllegalTransition → CONFLICT で詰まる）。
      this.timers.set(cur.id, cur);
      await this.ctx.storage.put(`timer:${cur.id}`, cur);
      throw e;
    }
    this.version++;
    await this.persistVersion();
    await this.idemp.markApplied(cmd.idempotencyKey, idempKey);
    this.conns.broadcast(timerMessage(this.version, now, toTimerSnapshot(next)));
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
    if (await this.idemp.isApplied(cmd.idempotencyKey, idempKey)) {
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
    await this.idemp.markApplied(cmd.idempotencyKey, idempKey);
    this.version++;
    await this.persistVersion();
    this.conns.broadcast(counterMessage(this.version, next, cmd.counterId));
    this.flushDueMs = now + FLUSH_DEBOUNCE_MS;
    await this.reconcileAlarm();
    return this.counterResult(cmd.counterId, next, now);
  }

  // --- WebSocket（Hibernation）---
  private async handleUpgrade(req: Request): Promise<Response> {
    const meta = await this.conns.authorize(req, this.eventId);
    if (!meta) return new Response("unauthorized", { status: 401 });
    const res = this.conns.accept(meta, JSON.stringify(this.buildSnapshot()));
    await this.broadcastPresence();
    return res;
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    // WS 経由の状態変更は許さない。ping / resync のみ。
    const text = typeof message === "string" ? message : "";
    if (text === "ping") {
      // app層 heartbeat はテキスト "ping"/"pong"（frontend-design §M6 契約。
      // FE socket.ts は raw "pong" のみ notePong する — JSON だと pong-timeout で切断）。
      ws.send("pong");
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
    await this.broadcastPresence(ws);
  }

  override async webSocketError(): Promise<void> {
    await this.broadcastPresence();
  }

  // --- broadcast / snapshot ---
  // FE store は「差分 version は cur+1 厳守、<=cur は冪等無視」のため、presence も
  // version を bump して送る（bump しないと既接続クライアントが presence 差分を常に破棄する）。
  private async broadcastPresence(exclude?: WebSocket): Promise<void> {
    this.version++;
    await this.persistVersion();
    this.conns.broadcast(
      presenceMessage(this.version, this.conns.count(exclude)),
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
      presenceCount: this.conns.count(),
    };
  }
  private buildSnapshot() {
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
        this.conns.broadcast(timerMessage(this.version, now, toTimerSnapshot(next)));
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
    } catch (e) {
      log("error", "wal_flush_failed", {
        entries: entries.length,
        error: e instanceof Error ? e.message : String(e),
      });
      this.flushDueMs = now + FLUSH_DEBOUNCE_MS; // 全残置で次 alarm 再送
    }
  }
}

function walKey(globalSeq: number): string {
  return `wal:${String(globalSeq).padStart(16, "0")}`;
}
