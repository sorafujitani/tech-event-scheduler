import type { ScheduleItemKind } from "@app/shared";

export const KIND_LABEL: Record<ScheduleItemKind, string> = {
  session: "セッション",
  break: "休憩",
  other: "その他",
};

export const KIND_OPTIONS: { label: string; value: ScheduleItemKind }[] = [
  { label: "セッション", value: "session" },
  { label: "休憩", value: "break" },
  { label: "その他", value: "other" },
];

export const minutesOf = (s: string) => Math.max(1, Number(s) || 1);
