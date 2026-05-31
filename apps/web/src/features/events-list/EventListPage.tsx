import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Box } from "@yamada-ui/react/components/box";
// Link は既に import 済み（一覧アイテムを詳細へリンク）
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
          <Link
            key={ev.id}
            to="/events/$eventId"
            params={{ eventId: ev.id }}
            style={{ textDecoration: "none", width: "100%" }}
          >
            <Box
              borderWidth="1px"
              rounded="md"
              p="md"
              w="full"
              _hover={{ bg: ["blackAlpha.50", "whiteAlpha.50"] }}
            >
              <HStack justify="space-between" align="center">
                <VStack gap="xs" align="start">
                  <Text fontWeight="bold">{ev.title}</Text>
                  <Text fontSize="sm" color="muted">
                    {STATUS_LABEL[ev.status] ?? ev.status}・{ev.role}
                  </Text>
                </VStack>
                <Text fontSize="sm" color="muted" aria-hidden>
                  ▸
                </Text>
              </HStack>
            </Box>
          </Link>
        ))
      )}
    </VStack>
  );
}
