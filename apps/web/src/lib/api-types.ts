import type { FullSnapshot } from "@app/shared";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { api } from "./api-client";

type Client = ReturnType<typeof api>;

export type EventDetail = InferResponseType<
  Client["api"]["events"][":eventId"]["$get"],
  200
>;
export type EventList = InferResponseType<Client["api"]["events"]["$get"], 200>;
export type FullSnapshotRes = InferResponseType<
  Client["api"]["events"][":eventId"]["live"]["$get"],
  200
>;
export type CreateEventInput = InferRequestType<
  Client["api"]["events"]["$post"]
>["json"];
export type AdjustCounterInput = InferRequestType<
  Client["api"]["events"][":eventId"]["counters"][":counterId"]["adjust"]["$post"]
>["json"];

// C2: timer 操作の RPC 型（useTimerOps が同一アクセサ経路を使う）。
type TimerStart =
  Client["api"]["events"][":eventId"]["schedule"][":itemId"]["timer"]["start"]["$post"];
export type TimerOpInput = InferRequestType<TimerStart>;
export type TimerOpRes = InferResponseType<TimerStart, 200>;
export type ExtendTimerInput = InferRequestType<
  Client["api"]["events"][":eventId"]["schedule"][":itemId"]["timer"]["extend"]["$patch"]
>["json"];

// m3: wire 型(@app/shared FullSnapshot, Date 列なし)と RPC レスポンス型の構造一致をコンパイル突合。
export const assertFullSnapshotShape = (x: FullSnapshotRes): FullSnapshot => x;
