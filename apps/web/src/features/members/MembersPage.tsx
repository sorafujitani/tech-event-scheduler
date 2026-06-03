import { Button } from "@yamada-ui/react/components/button";
import { Card } from "@yamada-ui/react/components/card";
import { Input } from "@yamada-ui/react/components/input";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useState } from "react";
import { PageContainer } from "../../components/layout/PageContainer";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
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
    <PageContainer>
      <VStack gap="lg" align="stretch">
        <PageHeader
          title="メンバー"
          description="イベント運営に参加するメンバーを管理します。"
        />

        {members.length === 0 ? (
          <EmptyState
            title="メンバーがいません"
            description="ユーザー ID を指定して manager を追加できます。"
          />
        ) : (
          <VStack gap="sm" align="stretch">
            {members.map((mem) => (
              <Panel key={mem.id} p="md">
                <HStack justify="space-between" align="center">
                  <VStack gap={0} align="start" minW={0}>
                    <Text fontWeight="medium" truncated>
                      {mem.userId ?? mem.invitedEmail ?? "(招待)"}
                    </Text>
                    <Text fontSize="sm" color="fg.muted">
                      {mem.role} · {mem.status}
                    </Text>
                  </VStack>
                  {mem.userId ? (
                    <Button
                      size="sm"
                      variant="subtle"
                      colorScheme="red"
                      onClick={() => mutations.remove.mutate(mem.userId as string)}
                    >
                      解除
                    </Button>
                  ) : null}
                </HStack>
              </Panel>
            ))}
          </VStack>
        )}

        <Card.Root variant="panel">
          <Card.Header fontSize="md" fontWeight="semibold">
            メンバー追加
          </Card.Header>
          <Card.Body gap="sm">
            <Field label="ユーザー ID" hint="owner 権限が必要です。">
              <Input
                placeholder="user id"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </Field>
            <Button
              colorScheme="primary"
              disabled={userId.trim().length === 0 || mutations.assign.isPending}
              onClick={add}
            >
              manager として追加
            </Button>
            {mutations.assign.isError ? (
              <Text color="red.600" fontSize="sm">
                追加に失敗しました（owner 権限・ユーザーIDをご確認ください）。
              </Text>
            ) : null}
          </Card.Body>
        </Card.Root>
      </VStack>
    </PageContainer>
  );
}
