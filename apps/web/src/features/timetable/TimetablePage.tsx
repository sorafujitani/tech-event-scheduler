import { Button } from "@yamada-ui/react/components/button";
import { Input } from "@yamada-ui/react/components/input";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useState } from "react";
import { PageContainer } from "../../components/layout/PageContainer";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { useSchedule } from "../../hooks/mutations/useSchedule";
import { useEventDetail } from "../../hooks/useEventDetail";

const KIND_LABEL: Record<string, string> = {
  session: "セッション",
  break: "休憩",
  other: "その他",
};

export function TimetablePage({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const sched = useSchedule(eventId);
  const [title, setTitle] = useState("");
  const [min, setMin] = useState("10");
  const items = (data?.items ?? []).toSorted(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  const add = () => {
    const minutes = Math.max(1, Number(min) || 1);
    sched.create.mutate({
      title: title.trim(),
      plannedDurationSec: minutes * 60,
    });
    setTitle("");
  };

  return (
    <PageContainer>
      <VStack gap="lg" align="stretch">
        <PageHeader
          title="進行表"
          description="セッションの順序と所要時間を設定します。Live タブで進行できます。"
        />

        {items.length === 0 ? (
          <EmptyState
            title="セッションがありません"
            description="下のフォームから最初のセッションを追加してください。"
          />
        ) : (
          <VStack gap="sm" align="stretch">
            {items.map((it) => (
              <Panel key={it.id} variant="elevated" p="md">
                <HStack justify="space-between" align="center">
                  <VStack gap={0} align="start" minW={0}>
                    <Text fontWeight="medium">{it.title}</Text>
                    <Text fontSize="sm" color="fg.muted">
                      {Math.round(it.plannedDurationSec / 60)}分 ·{" "}
                      {KIND_LABEL[it.kind] ?? it.kind} · {it.status}
                    </Text>
                  </VStack>
                  <Button
                    size="sm"
                    variant="subtle"
                    colorScheme="red"
                    onClick={() => sched.remove.mutate(it.id)}
                  >
                    削除
                  </Button>
                </HStack>
              </Panel>
            ))}
          </VStack>
        )}

        <Panel variant="elevated" p="lg">
          <VStack gap="md" align="stretch">
            <Text fontSize="md" fontWeight="semibold" letterSpacing="tight">
              セッション追加
            </Text>
            <Field label="タイトル">
              <Input
                placeholder="タイトル"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
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
            <Button
              colorScheme="primary"
              rounded="lg"
              disabled={title.trim().length === 0 || sched.create.isPending}
              onClick={add}
            >
              追加
            </Button>
          </VStack>
        </Panel>
      </VStack>
    </PageContainer>
  );
}
