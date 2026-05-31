import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useMemo } from "react";
import { BigTimer } from "../../components/timer/BigTimer";
import { useTimers } from "../../lib/live/react/hooks";
import { useServerNow } from "../../lib/live/react/useTimerTick";
import { useEventDetail } from "../../hooks/useEventDetail";
import { useTimerOps } from "../../hooks/mutations/useTimerOps";

export function TimerSection({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const timers = useTimers();
  const items = useMemo(
    () => (data?.items ?? []).toSorted((a, b) => a.orderIndex - b.orderIndex),
    [data],
  );

  // 現在 = running/paused、なければ最初の scheduled。
  let idx = items.findIndex((i) => {
    const t = timers.get(i.id);
    return t?.status === "running" || t?.status === "paused";
  });
  if (idx < 0)
    idx = items.findIndex((i) => {
      const t = timers.get(i.id);
      return !t || t.status === "scheduled";
    });
  const current = idx >= 0 ? items[idx] : undefined;
  const next = idx >= 0 ? items[idx + 1] : undefined;
  const snap = current ? timers.get(current.id) : undefined;
  const nowMs = useServerNow(snap?.status === "running");
  const ops = useTimerOps(eventId, current?.id ?? "");

  if (items.length === 0) {
    return (
      <Text color="muted" textAlign="center" py="lg">
        「進行表」タブからセッションを追加してください。
      </Text>
    );
  }
  if (!current) {
    return (
      <Text color="muted" textAlign="center" py="lg">
        すべてのセッションが終了しました。
      </Text>
    );
  }

  const status = snap?.status ?? "scheduled";
  const pending =
    ops.start.isPending ||
    ops.pause.isPending ||
    ops.resume.isPending ||
    ops.complete.isPending ||
    ops.skip.isPending;

  return (
    <VStack gap="md" align="stretch">
      <Text fontSize="sm" color="muted">
        NOW · {idx + 1}/{items.length}
      </Text>
      <Box borderWidth="1px" rounded="lg" p="md">
        <VStack gap="md" align="center">
          <Text fontWeight="bold" fontSize="lg" textAlign="center">
            {current.title}
          </Text>
          {snap ? (
            <BigTimer snapshot={snap} nowMs={nowMs} />
          ) : (
            <Text fontSize="6xl" fontWeight="black" fontFamily="mono">
              {Math.floor(current.plannedDurationSec / 60)}:00
            </Text>
          )}

          <HStack gap="md" wrap="wrap" justify="center">
            {status === "scheduled" ? (
              <Button
                colorScheme="primary"
                minH="tapMain"
                px="xl"
                disabled={pending}
                onClick={() => ops.start.mutate()}
              >
                ▶ 開始
              </Button>
            ) : null}
            {status === "running" ? (
              <Button minH="tapMain" disabled={pending} onClick={() => ops.pause.mutate()}>
                ⏸ 一時停止
              </Button>
            ) : null}
            {status === "paused" ? (
              <Button
                colorScheme="primary"
                minH="tapMain"
                disabled={pending}
                onClick={() => ops.resume.mutate()}
              >
                ▶ 再開
              </Button>
            ) : null}
            {status === "running" || status === "paused" ? (
              <Button
                colorScheme="primary"
                minH="tapMain"
                px="xl"
                disabled={pending}
                onClick={() => ops.complete.mutate()}
              >
                次へ ▶▶
              </Button>
            ) : null}
          </HStack>
          {status === "running" || status === "paused" ? (
            <HStack gap="sm">
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => ops.skip.mutate()}>
                スキップ
              </Button>
              <Button size="sm" variant="outline" onClick={() => ops.extend.mutate(300)}>
                +5分
              </Button>
            </HStack>
          ) : null}
        </VStack>
      </Box>
      {next ? (
        <Text fontSize="sm" color="muted">
          NEXT ▸ {next.title}
        </Text>
      ) : null}
    </VStack>
  );
}
