import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { Input } from "@yamada-ui/react/components/input";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useState } from "react";
import { useMembers } from "../../hooks/mutations/useMembers";
import { useEventDetail } from "../../hooks/useEventDetail";

export function MembersPage({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const mutations = useMembers(eventId);
  const [userId, setUserId] = useState("");
  const members = data?.members ?? [];

  const add = () => {
    if (!userId.trim()) return;
    mutations.assign.mutate({ userId: userId.trim(), role: "manager" });
    setUserId("");
  };

  return (
    <VStack p="md" gap="md" maxW="640px" mx="auto" align="stretch">
      <Heading size="lg">メンバー</Heading>
      {members.map((mem) => (
        <HStack
          key={mem.id}
          justify="space-between"
          borderWidth="1px"
          rounded="md"
          p="sm"
        >
          <VStack gap={0} align="start" minW={0}>
            <Text fontWeight="medium" truncated>
              {mem.userId ?? mem.invitedEmail ?? "(招待)"}
            </Text>
            <Text fontSize="sm" color="muted">
              {mem.role}・{mem.status}
            </Text>
          </VStack>
          {mem.userId ? (
            <Button
              size="sm"
              variant="ghost"
              colorScheme="red"
              onClick={() => mutations.remove.mutate(mem.userId as string)}
            >
              解除
            </Button>
          ) : null}
        </HStack>
      ))}

      <Box borderWidth="1px" rounded="md" p="md">
        <VStack gap="sm" align="stretch">
          <Text fontWeight="medium">メンバー追加（ユーザーID）</Text>
          <Input
            placeholder="user id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <Button
            colorScheme="primary"
            disabled={userId.trim().length === 0 || mutations.assign.isPending}
            onClick={add}
          >
            manager として追加
          </Button>
          {mutations.assign.isError ? (
            <Text color="red.500" fontSize="sm">
              追加に失敗しました（owner 権限・ユーザーIDをご確認ください）。
            </Text>
          ) : null}
        </VStack>
      </Box>
    </VStack>
  );
}
