import { remainingMs, type TimerSnapshot } from "@app/shared";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";

function fmt(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type BigTimerProps = { snapshot: TimerSnapshot; nowMs: number };

// nowMs は useRemainingMs/ServerClock 供給（端末時計非依存）。role="timer"。
export function BigTimer({ snapshot, nowMs }: BigTimerProps) {
  const remaining = remainingMs(snapshot, nowMs);
  const overrun = remaining < 0;
  const soon = !overrun && remaining < 60_000;
  const color = overrun
    ? "timer.overrun"
    : soon
      ? "timer.soon"
      : "timer.normal";
  return (
    <VStack gap="xs" align="center" role="timer">
      <Text
        fontSize="6xl"
        fontWeight="black"
        fontFamily="mono"
        color={color}
        lineHeight="1"
      >
        {fmt(Math.max(0, remaining))}
      </Text>
      {overrun ? (
        <Text color="timer.overrun" fontWeight="bold">
          ⚠ +{fmt(remaining)} 超過
        </Text>
      ) : null}
    </VStack>
  );
}
