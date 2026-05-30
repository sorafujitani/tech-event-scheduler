import { DomainError } from "../errors";
import type { Bindings } from "../env";
import {
  INTERNAL_COMMAND_PATH,
  type RoomCommand,
  type RoomResponse,
  type RoomResult,
} from "../durable/protocol";

export function eventRoomStub(env: Bindings, eventId: string) {
  // §3.1 1イベント1DO（idFromName）
  return env.EVENT_ROOM.get(env.EVENT_ROOM.idFromName(eventId));
}

export async function callRoom(
  env: Bindings,
  eventId: string,
  cmd: RoomCommand,
): Promise<RoomResult> {
  const stub = eventRoomStub(env, eventId);
  const res = await stub.fetch(`https://room${INTERNAL_COMMAND_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-event-id": eventId },
    body: JSON.stringify(cmd),
  });
  const data = (await res.json()) as RoomResponse;
  // DO の CONFLICT/FORBIDDEN 等を REST へ伝播（onError が ErrorBody に正規化）
  if (!data.ok) throw new DomainError(data.code, data.error);
  return data;
}
