import type { ScheduleItemKind } from "@app/shared";
import { Button, IconButton } from "@yamada-ui/react/components/button";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  TrashIcon,
} from "@yamada-ui/react/components/icon";
import { Input } from "@yamada-ui/react/components/input";
import { Select } from "@yamada-ui/react/components/select";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { Textarea } from "@yamada-ui/react/components/textarea";
import { useEffect, useRef, useState } from "react";
import { useConfirmUndo } from "../../components/feedback/ConfirmUndo";
import { PageContainer } from "../../components/layout/PageContainer";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { useSchedule } from "../../hooks/mutations/useSchedule";
import { useEventDetail } from "../../hooks/useEventDetail";
import type { EventDetail } from "../../lib/api-types";
import { KIND_LABEL, KIND_OPTIONS, minutesOf } from "./constants";
import { ScheduleItemEditor } from "./ScheduleItemEditor";

// 連続入力のための「最後に使った分数」記憶（クライアントのみ・SSR 非対応は初期値で吸収）
const LAST_MINUTES_KEY = "timetable.lastMinutes";
const DEFAULT_MINUTES = "10";

const readLastMinutes = (): string => {
  if (typeof window === "undefined") return DEFAULT_MINUTES;
  return window.localStorage.getItem(LAST_MINUTES_KEY) ?? DEFAULT_MINUTES;
};
const writeLastMinutes = (v: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_MINUTES_KEY, v);
};

// 複数行テキストのパース: 「タイトル: 25分」「タイトル:25」に対応。
// 区切り・分数なしの行は既定分数を使う。空行は無視。
const parseBatchLines = (
  text: string,
  fallbackMinutes: number,
): { title: string; minutes: number }[] => {
  const out: { title: string; minutes: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^:：]+?)\s*[:：]\s*(\d+)\s*分?$/);
    const title = m?.[1]?.trim();
    out.push(
      title
        ? { title, minutes: Math.max(1, Number(m?.[2] ?? 1)) }
        : { title: line, minutes: fallbackMinutes },
    );
  }
  return out;
};

type ScheduleItemRow = EventDetail["items"][number];

export function TimetablePage({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const sched = useSchedule(eventId);
  const { run: confirmUndo } = useConfirmUndo();

  // クイック追加（1件ずつ）
  const [title, setTitle] = useState("");
  const [min, setMin] = useState(DEFAULT_MINUTES);
  const [kind, setKind] = useState<ScheduleItemKind>("session");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // 保存済みの「最後に使った分数」を hydration 後に反映（SSR 不一致を避ける）
    setMin(readLastMinutes());
  }, []);

  // 一括追加
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchPending, setBatchPending] = useState(false);

  // 編集 Drawer（本体は ScheduleItemEditor に分離）
  const [editing, setEditing] = useState<ScheduleItemRow | null>(null);

  const items = (data?.items ?? []).toSorted(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  const quickAdd = () => {
    const t = title.trim();
    if (!t) return;
    const minutes = minutesOf(min);
    setTitle("");
    writeLastMinutes(String(minutes));
    titleRef.current?.focus(); // Enter 連打で連続追加できるようフォーカス維持
    sched.create.mutate({
      title: t,
      plannedDurationSec: minutes * 60,
      kind,
    });
  };

  const batchAdd = async () => {
    const parsed = parseBatchLines(batchText, minutesOf(min));
    if (parsed.length === 0) return;
    setBatchPending(true);
    setBatchError(null);
    try {
      for (const p of parsed) {
        // 逐次 POST は意図的: orderIndex はサーバー採番のため、並列だと順序が
        // 不定になる。失敗時は残りを中止して raise する（fail-fast）。
        // eslint-disable-next-line no-await-in-loop -- orderIndex 順序保証のため逐次必須
        await sched.create.mutateAsync({
          title: p.title,
          plannedDurationSec: p.minutes * 60,
        });
      }
      setBatchText("");
    } catch {
      setBatchError("追加に失敗しました。もう一度お試しください。");
    } finally {
      setBatchPending(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    // noUncheckedIndexedAccess 下では next[i] が undefined になり得るため temp 経由で swap
    const a = next[index];
    const b = next[j];
    if (!a || !b) return;
    next[index] = b;
    next[j] = a;
    sched.reorder.mutate(next.map((it) => it.id));
  };

  const openEdit = (item: ScheduleItemRow) => {
    setEditing(item);
  };

  const removeWithUndo = (item: ScheduleItemRow) => {
    confirmUndo("セッションを削除しました", () => sched.remove.mutate(item.id));
  };

  return (
    <PageContainer>
      <VStack gap="lg" align="stretch">
        <PageHeader
          title="進行表"
          description="セッションの順序と所要時間を設定します。Live タブで進行できます。"
        />

        <Panel variant="elevated" p="lg">
          <VStack gap="md" align="stretch">
            <Text fontSize="md" fontWeight="semibold" letterSpacing="tight">
              セッション追加
            </Text>
            <Field label="タイトル">
              <Input
                ref={titleRef}
                placeholder="タイトル"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.nativeEvent.isComposing &&
                    title.trim()
                  ) {
                    e.preventDefault();
                    quickAdd();
                  }
                }}
              />
            </Field>
            <HStack gap="md" align="flex-end">
              <Field label="所要時間">
                <HStack>
                  <Input
                    type="number"
                    w="6rem"
                    min={1}
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                  />
                  <Text color="fg.muted">分</Text>
                </HStack>
              </Field>
              <Field label="種別">
                <Select.Root
                  w="8rem"
                  items={KIND_OPTIONS}
                  value={kind}
                  onChange={(v) => setKind(v as ScheduleItemKind)}
                />
              </Field>
            </HStack>
            <Button
              colorScheme="primary"
              rounded="lg"
              disabled={!title.trim() || sched.create.isPending}
              onClick={quickAdd}
            >
              追加（Enter で連続追加）
            </Button>
            {sched.create.isError ? (
              <Text color="red.600" fontSize="sm">
                追加に失敗しました。時間をおいて再試行してください。
              </Text>
            ) : null}

            <Button
              variant="subtle"
              size="sm"
              alignSelf="flex-start"
              onClick={() => setBatchOpen((v) => !v)}
            >
              まとめて追加
            </Button>
            {batchOpen ? (
              <VStack gap="md" align="stretch">
                <Field
                  label="まとめて追加"
                  hint="1行1セッション。例: 基調講演: 25分 / 休憩: 10分（分数を省略すると上記の所要時間を使います）"
                >
                  <Textarea
                    rows={6}
                    placeholder={
                      "基調講演: 25分\n休憩: 10分\nワークショップ\n懇親会: 30分"
                    }
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                  />
                </Field>
                <Button
                  colorScheme="primary"
                  variant="outline"
                  rounded="lg"
                  disabled={batchPending || batchText.trim().length === 0}
                  onClick={batchAdd}
                >
                  {batchPending ? "追加中…" : "一括追加"}
                </Button>
                {batchError ? (
                  <Text color="red.600" fontSize="sm">
                    {batchError}
                  </Text>
                ) : null}
              </VStack>
            ) : null}
          </VStack>
        </Panel>

        {items.length === 0 ? (
          <EmptyState
            title="セッションがありません"
            description="上のフォームから最初のセッションを追加してください。"
          />
        ) : (
          <VStack gap="sm" align="stretch">
            {items.map((it, i) => (
              <Panel key={it.id} variant="elevated" p="md">
                <HStack justify="space-between" align="center" gap="sm">
                  <VStack gap={0} align="start" minW={0} flex={1}>
                    <Text fontWeight="medium" truncated>
                      {it.title}
                    </Text>
                    <Text fontSize="sm" color="fg.muted">
                      {Math.round(it.plannedDurationSec / 60)}分 ·{" "}
                      {KIND_LABEL[it.kind]} · {it.status}
                    </Text>
                  </VStack>
                  <HStack gap="xs">
                    <IconButton
                      size="sm"
                      variant="subtle"
                      aria-label="上へ移動"
                      icon={<ChevronUpIcon />}
                      disabled={i === 0 || sched.reorder.isPending}
                      onClick={() => move(i, -1)}
                    />
                    <IconButton
                      size="sm"
                      variant="subtle"
                      aria-label="下へ移動"
                      icon={<ChevronDownIcon />}
                      disabled={
                        i === items.length - 1 || sched.reorder.isPending
                      }
                      onClick={() => move(i, 1)}
                    />
                    <IconButton
                      size="sm"
                      variant="subtle"
                      aria-label="編集"
                      icon={<PencilIcon />}
                      onClick={() => openEdit(it)}
                    />
                    <IconButton
                      size="sm"
                      variant="subtle"
                      colorScheme="red"
                      aria-label="削除"
                      icon={<TrashIcon />}
                      onClick={() => removeWithUndo(it)}
                    />
                  </HStack>
                </HStack>
              </Panel>
            ))}
          </VStack>
        )}
      </VStack>

      {/* 編集 Drawer（下部スライドイン / mobile-first） */}
      <ScheduleItemEditor
        item={editing}
        update={sched.update}
        onClose={() => setEditing(null)}
      />
    </PageContainer>
  );
}
