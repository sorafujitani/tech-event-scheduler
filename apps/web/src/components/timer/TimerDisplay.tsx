import {
  elapsedMs,
  remainingMs,
  TIMER_SOON_THRESHOLD_MS,
  type TimerSnapshot,
} from "@app/shared";
import { Box } from "@yamada-ui/react/components/box";
import { Progress } from "@yamada-ui/react/components/progress";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import {
  fmtDurationMs,
  fmtDurationSec,
  formatTimerDisplayMs,
  type TimerUiStatus,
} from "./timer-labels";

export type TimerDisplayProps = {
  snapshot?: TimerSnapshot | undefined;
  plannedDurationSec: number;
  nowMs: number;
  uiStatus: TimerUiStatus;
  remainingOverride?: number | null;
};

function timeCaption(uiStatus: TimerUiStatus, remaining: number): string {
  switch (uiStatus) {
    case "scheduled":
      return "予定";
    case "running":
      return "残り";
    case "paused":
      return remaining < 0 ? "超過 · 停止中" : "残り · 停止中";
    case "overrun":
      return "超過";
  }
}

export function TimerDisplay({
  snapshot,
  plannedDurationSec,
  nowMs,
  uiStatus,
  remainingOverride = null,
}: TimerDisplayProps) {
  const plannedSec = snapshot?.plannedDurationSec ?? plannedDurationSec;
  const plannedMs = plannedSec * 1000;
  const computedRemaining = snapshot ? remainingMs(snapshot, nowMs) : plannedMs;
  const remaining = remainingOverride ?? computedRemaining;
  const elapsed = snapshot ? elapsedMs(snapshot, nowMs) : 0;
  const progress = snapshot
    ? Math.min(100, (elapsed / plannedMs) * 100)
    : 0;
  const isOverrunDisplay =
    uiStatus === "overrun" || (uiStatus === "paused" && remaining < 0);

  const display = formatTimerDisplayMs(uiStatus, remaining, plannedSec);

  const timeColor = isOverrunDisplay
    ? "timer.overrun"
    : uiStatus === "running" && remaining < TIMER_SOON_THRESHOLD_MS
      ? "timer.soon"
      : "timer.normal";

  const progressScheme = isOverrunDisplay
    ? "red"
    : uiStatus === "paused"
      ? "orange"
      : "blue";

  return (
    <Box layerStyle="well" w="full">
      <VStack gap="xs" align="center">
        <Text fontSize="xs" color="fg.muted" fontWeight="medium">
          {timeCaption(uiStatus, remaining)}
        </Text>
        <Text
          fontSize={{ base: "3.5rem", sm: "4rem" }}
          fontWeight="700"
          fontFamily="mono"
          color={timeColor}
          lineHeight="1"
          letterSpacing="timer"
          role="timer"
          aria-label={
            isOverrunDisplay
              ? `予定時間を${fmtDurationMs(-remaining)}超過`
              : uiStatus === "scheduled"
                ? `予定時間 ${fmtDurationSec(plannedSec)}`
                : `残り ${fmtDurationMs(Math.max(0, remaining))}`
          }
        >
          {display}
        </Text>
        {snapshot && uiStatus !== "scheduled" ? (
          <Box w="full" maxW="12rem" pt="sm">
            <Progress
              w="full"
              max={100}
              value={isOverrunDisplay ? 100 : progress}
              colorScheme={progressScheme}
            />
          </Box>
        ) : null}
      </VStack>
    </Box>
  );
}
