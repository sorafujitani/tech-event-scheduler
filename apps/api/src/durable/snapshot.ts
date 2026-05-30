import type {
  FullSnapshot,
  LiveMessage,
  ModuleSnapshot,
  TimerSnapshot,
} from "@app/shared";
import type { CounterState } from "./counter-core";
import type { RoomTimer } from "./timer-machine";

/** RoomTimer から wire 用 TimerSnapshot（track/overrunNotified を落とす）を取り出す。 */
export function toTimerSnapshot(t: RoomTimer): TimerSnapshot {
  const { track: _track, overrunNotified: _o, ...snap } = t;
  return snap;
}

// counter variant は serverNowMs を含めない（M3 / design.md §2.4）。capacity も含めない（§5.7 補足）。
export function counterMessage(
  version: number,
  c: CounterState,
  counterId: string,
): LiveMessage {
  return {
    kind: "counter",
    version,
    payload: { counterId, value: c.value, seq: c.seq },
  };
}

export function timerMessage(
  version: number,
  serverNowMs: number,
  t: TimerSnapshot,
): LiveMessage {
  return { kind: "timer", version, serverNowMs, payload: t };
}

export function scheduleMessage(
  version: number,
  items: TimerSnapshot[],
): LiveMessage {
  return { kind: "schedule", version, payload: { items } };
}

export function presenceMessage(version: number, count: number): LiveMessage {
  return { kind: "presence", version, payload: { count } };
}

export interface RoomStateView {
  version: number;
  timers: RoomTimer[];
  counters: { id: string; state: CounterState }[];
  presenceCount: number;
}

export function buildFullSnapshot(
  view: RoomStateView,
  serverNowMs: number,
): FullSnapshot {
  const timers = view.timers.map(toTimerSnapshot);
  const counters = view.counters.map((c) => ({
    counterId: c.id,
    value: c.state.value,
    seq: c.state.seq,
    capacity: c.state.capacity,
  }));
  // ModuleSnapshot は discriminated union。新モジュールは 1 variant 追加で exhaustive 検査が効く。
  const modules: ModuleSnapshot[] = [
    { moduleType: "timetable", data: { items: timers } },
    {
      moduleType: "attendance",
      data: {
        counters: counters.map((c) => ({
          id: c.counterId,
          value: c.value,
          seq: c.seq,
        })),
      },
    },
  ];
  return {
    version: view.version,
    serverNowMs,
    timers,
    counters,
    modules,
    presence: { count: view.presenceCount },
  };
}

export function snapshotMessage(
  view: RoomStateView,
  serverNowMs: number,
): LiveMessage {
  return {
    kind: "snapshot",
    version: view.version,
    serverNowMs,
    payload: buildFullSnapshot(view, serverNowMs),
  };
}
