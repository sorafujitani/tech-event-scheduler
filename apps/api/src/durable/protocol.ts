import type { ErrorBody, FullSnapshot, TimerSnapshot } from "@app/shared";

export const INTERNAL_COMMAND_PATH = "/__room/command";
export const INTERNAL_WS_PATH = "/__room/ws";

export type RoomCommand =
  | { type: "timer.start"; itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.pause"; itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.resume"; itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.complete"; itemId: string; actorUserId: string; idempotencyKey: string }
  | { type: "timer.skip"; itemId: string; actorUserId: string; idempotencyKey: string }
  | {
      type: "timer.extend";
      itemId: string;
      deltaSec: number;
      actorUserId: string;
      idempotencyKey: string;
    }
  | {
      type: "counter.adjust";
      counterId: string;
      delta: number;
      actorUserId: string;
      idempotencyKey: string;
    }
  | { type: "counter.reset"; counterId: string; actorUserId: string; idempotencyKey: string }
  | { type: "sync.schedule" }
  | { type: "sync.counters" }
  | { type: "snapshot.get" };

// 成功応答（command に対応）— REST 専用。WS broadcast には使わない（§5.7）。
export type RoomResult =
  | { ok: true; type: "snapshot"; version: number; serverNowMs: number; payload: FullSnapshot }
  | { ok: true; type: "timer"; version: number; serverNowMs: number; payload: TimerSnapshot }
  | {
      ok: true;
      type: "counter";
      version: number;
      serverNowMs: number;
      payload: { counterId: string; value: number; seq: number };
    }
  | { ok: true; type: "ack"; version: number; serverNowMs: number };

// エラー応答（REST へ ErrorBody.code のまま伝播。HTTP status は §5.9 で code 由来）。
export type RoomError = { ok: false } & ErrorBody;
export type RoomResponse = RoomResult | RoomError;
