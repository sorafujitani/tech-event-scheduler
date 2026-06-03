import { remainingMs } from "@app/shared";
import { Link } from "@tanstack/react-router";
import { Button, IconButton } from "@yamada-ui/react/components/button";
import {
  ClockPlusIcon,
  CirclePauseIcon,
  CirclePlayIcon,
  SquareIcon,
} from "@yamada-ui/react/components/icon";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useEffect, useMemo, useRef } from "react";
import { TimerDisplay } from "../../components/timer/TimerDisplay";
import {
  TIMER_STATUS_META,
  type TimerUiStatus,
} from "../../components/timer/timer-labels";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { StatusPill } from "../../components/ui/StatusPill";
import { useTimers } from "../../lib/live/react/hooks";
import { useServerNow } from "../../lib/live/react/useTimerTick";
import { useEventDetail } from "../../hooks/useEventDetail";
import { useTimerOps } from "../../hooks/mutations/useTimerOps";

function vibrate(pattern: number | number[]) {
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate === "function") nav.vibrate(pattern);
}

function resolveUiStatus(
  status: string,
  snap: { status: string } | undefined,
  remaining: number | null,
): TimerUiStatus {
  if (status === "scheduled" || !snap) return "scheduled";
  if (status === "paused") return "paused";
  if (status === "running" && remaining != null && remaining < 0) return "overrun";
  if (status === "running") return "running";
  return "scheduled";
}

export function TimerSection({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const timers = useTimers();
  const items = useMemo(
    () => (data?.items ?? []).toSorted((a, b) => a.orderIndex - b.orderIndex),
    [data],
  );

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
  const isRunning = snap?.status === "running";
  const nowMs = useServerNow(isRunning);
  const ops = useTimerOps(eventId, current?.id ?? "");

  const bucketRef = useRef<"normal" | "soon" | "overrun">("normal");
  const frozenRemainingRef = useRef<number | null>(null);
  const remaining =
    snap && (snap.status === "running" || snap.status === "paused")
      ? remainingMs(snap, nowMs)
      : null;

  useEffect(() => {
    if (isRunning && remaining != null) {
      frozenRemainingRef.current = remaining;
    }
    if (snap?.status === "paused") {
      frozenRemainingRef.current = null;
    }
  }, [isRunning, remaining, snap?.status]);

  const displayRemaining =
    ops.pause.isPending && frozenRemainingRef.current != null
      ? frozenRemainingRef.current
      : remaining;

  useEffect(() => {
    if (!isRunning || remaining == null) {
      bucketRef.current = "normal";
      return;
    }
    const bucket =
      remaining < 0 ? "overrun" : remaining < 60_000 ? "soon" : "normal";
    if (bucket !== bucketRef.current) {
      if (bucket === "soon") vibrate(30);
      else if (bucket === "overrun") vibrate([60, 40, 60]);
      bucketRef.current = bucket;
    }
  }, [isRunning, remaining]);

  if (items.length === 0) {
    return (
      <EmptyState
        title="セッション未設定"
        description="進行表タブからセッションを追加できます。"
        action={
          <Link
            to="/events/$eventId/timetable"
            params={{ eventId }}
            style={{ textDecoration: "none" }}
          >
            <Button colorScheme="primary" size="sm">
              進行表を開く
            </Button>
          </Link>
        }
      />
    );
  }
  if (!current) {
    return (
      <EmptyState
        title="進行完了"
        description="すべてのセッションが終了しました。"
      />
    );
  }

  const status = snap?.status ?? "scheduled";
  const uiStatus = resolveUiStatus(status, snap, remaining);
  const meta = TIMER_STATUS_META[uiStatus];
  const pending =
    ops.start.isPending ||
    ops.pause.isPending ||
    ops.resume.isPending ||
    ops.complete.isPending ||
    ops.extend.isPending;

  const endSession = () => ops.complete.mutate();

  return (
    <Panel variant="elevated" p={{ base: "md", sm: "lg" }}>
      <VStack gap="lg" align="stretch">
        <HStack justify="space-between" align="center">
          <StatusPill
            label={meta.label}
            colorScheme={meta.colorScheme}
            pulse={uiStatus === "running" || uiStatus === "overrun"}
          />
          <Text fontSize="sm" color="fg.subtle" fontWeight="medium">
            {idx + 1}/{items.length}
          </Text>
        </HStack>

        <VStack gap="md" align="stretch">
          <Text fontWeight="semibold" fontSize="xl" lineHeight="short">
            {current.title}
          </Text>

          <TimerDisplay
            snapshot={snap}
            plannedDurationSec={current.plannedDurationSec}
            nowMs={nowMs}
            uiStatus={uiStatus}
            remainingOverride={
              ops.pause.isPending ? displayRemaining : null
            }
          />
        </VStack>

        <VStack gap="sm" align="stretch">
          {uiStatus === "scheduled" ? (
            <Button
              colorScheme="primary"
              size="lg"
              minH="tapMain"
              disabled={pending}
              onClick={() => ops.start.mutate()}
              startIcon={<CirclePlayIcon boxSize="1.125rem" />}
            >
              開始
            </Button>
          ) : null}

          {uiStatus === "running" ? (
            <HStack gap="sm">
              <Button
                flex={1}
                colorScheme="primary"
                size="lg"
                minH="tapMain"
                disabled={pending}
                onClick={() => ops.pause.mutate()}
                startIcon={<CirclePauseIcon boxSize="1.125rem" />}
              >
                停止
              </Button>
              <IconButton
                aria-label="5分延長"
                variant="outline"
                colorScheme="gray"
                size="lg"
                minH="tapMain"
                minW="tapMain"
                rounded="xl"
                disabled={pending}
                onClick={() => ops.extend.mutate(300)}
                icon={<ClockPlusIcon boxSize="1.125rem" />}
              />
              <IconButton
                aria-label="終了"
                variant="outline"
                colorScheme="gray"
                size="lg"
                minH="tapMain"
                minW="tapMain"
                rounded="xl"
                disabled={pending}
                onClick={endSession}
                icon={<SquareIcon boxSize="1rem" />}
              />
            </HStack>
          ) : null}

          {uiStatus === "overrun" ? (
            <>
              <Button
                colorScheme="primary"
                size="lg"
                minH="tapMain"
                disabled={pending}
                onClick={endSession}
              >
                終了
              </Button>
              <HStack gap="sm">
                <Button
                  flex={1}
                  variant="outline"
                  colorScheme="orange"
                  size="md"
                  disabled={pending}
                  onClick={() => ops.extend.mutate(300)}
                >
                  +5分
                </Button>
                <Button
                  flex={1}
                  variant="outline"
                  colorScheme="gray"
                  size="md"
                  disabled={pending}
                  onClick={() => ops.pause.mutate()}
                >
                  停止
                </Button>
              </HStack>
            </>
          ) : null}

          {uiStatus === "paused" ? (
            <HStack gap="sm">
              <Button
                flex={1}
                colorScheme="primary"
                size="lg"
                minH="tapMain"
                disabled={pending}
                onClick={() => ops.resume.mutate()}
                startIcon={<CirclePlayIcon boxSize="1.125rem" />}
              >
                再開
              </Button>
              <IconButton
                aria-label="終了"
                variant="outline"
                colorScheme="gray"
                size="lg"
                minH="tapMain"
                minW="tapMain"
                rounded="xl"
                disabled={pending}
                onClick={endSession}
                icon={<SquareIcon boxSize="1rem" />}
              />
            </HStack>
          ) : null}
        </VStack>

        {next ? (
          <HStack
            gap="sm"
            align="center"
            pt="md"
            borderTopWidth="1px"
            borderColor="border.base"
          >
            <Text fontSize="xs" color="fg.subtle" flexShrink={0}>
              NEXT
            </Text>
            <Text fontSize="sm" color="fg.muted" truncated>
              {next.title}
            </Text>
          </HStack>
        ) : null}
      </VStack>
    </Panel>
  );
}
