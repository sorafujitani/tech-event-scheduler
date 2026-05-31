import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { Input } from "@yamada-ui/react/components/input";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useState } from "react";
import { useCreateEvent } from "../../hooks/mutations/useCreateEvent";

export function EventCreateForm() {
  const [title, setTitle] = useState("");
  const create = useCreateEvent();
  const canSubmit = title.trim().length > 0 && !create.isPending;

  return (
    <VStack p="md" maxW="480px" mx="auto" gap="md">
      <Heading size="lg">イベント新規作成</Heading>
      <VStack gap="xs" align="stretch">
        <Text fontSize="sm" fontWeight="medium">
          イベント名
        </Text>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: TechConf 2026"
          autoFocus
        />
      </VStack>
      <Button
        colorScheme="primary"
        w="full"
        disabled={!canSubmit}
        onClick={() =>
          create.mutate({ title: title.trim(), timezone: "Asia/Tokyo" })
        }
      >
        作成
      </Button>
      {create.isError ? (
        <Text color="red.500" fontSize="sm">
          作成に失敗しました。時間をおいて再試行してください。
        </Text>
      ) : null}
    </VStack>
  );
}
