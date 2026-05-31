import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { api } from "../../lib/api-client";
import { unwrap } from "../../lib/api-error";
import type { EventList } from "../../lib/api-types";
import { qk } from "../../lib/query";

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  published: "公開",
  live: "進行中",
  ended: "終了",
  archived: "アーカイブ",
};

export function EventListPage() {
  const { data } = useQuery({
    queryKey: qk.events(),
    queryFn: async () => unwrap<EventList>(await api().api.events.$get()),
  });
  const events = data ?? [];

  return (
    <VStack p="md" gap="md" maxW="640px" mx="auto">
      <HStack justify="space-between" align="center">
        <Heading size="lg">管理イベント</Heading>
        <Button as={Link} {...{ to: "/events/new" }} colorScheme="primary" size="sm">
          新規作成
        </Button>
      </HStack>

      {events.length === 0 ? (
        <Text color="muted">イベントはまだありません。「新規作成」から追加してください。</Text>
      ) : (
        events.map((ev) => (
          <Box
            key={ev.id}
            borderWidth="1px"
            rounded="md"
            p="md"
            w="full"
          >
            <HStack justify="space-between" align="center">
              <VStack gap="xs" align="start">
                <Text fontWeight="bold">{ev.title}</Text>
                <Text fontSize="sm" color="muted">
                  {STATUS_LABEL[ev.status] ?? ev.status}・{ev.role}
                </Text>
              </VStack>
              {/* 詳細ページは Phase4。実装後に Link でラップする。 */}
              <Text fontSize="sm" color="muted">
                詳細（準備中）
              </Text>
            </HStack>
          </Box>
        ))
      )}
    </VStack>
  );
}
