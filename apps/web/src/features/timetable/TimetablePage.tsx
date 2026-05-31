import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { Input } from "@yamada-ui/react/components/input";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useState } from "react";
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
    <VStack p="md" gap="md" maxW="640px" mx="auto" align="stretch">
      <Heading size="lg">進行表</Heading>
      {items.length === 0 ? (
        <Text color="muted">セッションを追加してください。</Text>
      ) : (
        items.map((it) => (
          <HStack
            key={it.id}
            justify="space-between"
            borderWidth="1px"
            rounded="md"
            p="sm"
          >
            <VStack gap={0} align="start">
              <Text fontWeight="medium">{it.title}</Text>
              <Text fontSize="sm" color="muted">
                {Math.round(it.plannedDurationSec / 60)}分・
                {KIND_LABEL[it.kind] ?? it.kind}・{it.status}
              </Text>
            </VStack>
            <Button
              size="sm"
              variant="ghost"
              colorScheme="red"
              onClick={() => sched.remove.mutate(it.id)}
            >
              削除
            </Button>
          </HStack>
        ))
      )}

      <Box borderWidth="1px" rounded="md" p="md">
        <VStack gap="sm" align="stretch">
          <Text fontWeight="medium">セッション追加</Text>
          <Input
            placeholder="タイトル"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <HStack>
            <Input
              type="number"
              w="6rem"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
            <Text>分</Text>
          </HStack>
          <Button
            colorScheme="primary"
            disabled={title.trim().length === 0 || sched.create.isPending}
            onClick={add}
          >
            追加
          </Button>
        </VStack>
      </Box>
    </VStack>
  );
}
