import type { EventStatus } from "@app/shared";
import { Link } from "@tanstack/react-router";
import { Badge } from "@yamada-ui/react/components/badge";
import { ChevronRightIcon } from "@yamada-ui/react/components/icon";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { PageContainer } from "../../components/layout/PageContainer";
import { AppShell } from "../../components/shell/AppShell";
import { EmptyState } from "../../components/ui/EmptyState";
import { LinkButton } from "../../components/ui/LinkButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { useEvents } from "../../hooks/useEvents";

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "下書き",
  published: "公開",
  live: "進行中",
  ended: "終了",
  archived: "アーカイブ",
};

const STATUS_COLOR: Record<
  EventStatus,
  "gray" | "blue" | "green" | "orange" | "red"
> = {
  draft: "gray",
  published: "blue",
  live: "green",
  ended: "orange",
  archived: "gray",
};

export function EventListPage() {
  const { data } = useEvents();
  const events = data ?? [];

  return (
    <AppShell>
      <PageContainer>
      <VStack gap="lg" align="stretch">
        <PageHeader
          title="管理イベント"
          description="担当イベントの進行管理・設定を行います。"
          actions={
            <LinkButton to="/events/new" colorScheme="primary" size="sm" rounded="lg">
              新規作成
            </LinkButton>
          }
        />

        {events.length === 0 ? (
          <EmptyState
            title="イベントがありません"
            description="最初のイベントを作成して、進行表や Live 運営を始めましょう。"
            action={
              <LinkButton to="/events/new" colorScheme="primary" size="sm" rounded="lg">
                新規作成
              </LinkButton>
            }
          />
        ) : (
          <VStack gap="sm" align="stretch">
            {events.map((ev) => (
              <Link
                key={ev.id}
                to="/events/$eventId"
                params={{ eventId: ev.id }}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Panel variant="interactive" p="md" w="full" rounded="lg">
                  <HStack justify="space-between" align="center" gap="md">
                    <VStack gap="xs" align="start" minW={0}>
                      <Text fontWeight="semibold" truncated letterSpacing="tight">
                        {ev.title}
                      </Text>
                      <HStack gap="xs" wrap="wrap">
                        <Badge
                          size="sm"
                          variant="subtle"
                          colorScheme={STATUS_COLOR[ev.status]}
                        >
                          {STATUS_LABEL[ev.status]}
                        </Badge>
                        <Text fontSize="sm" color="fg.muted">
                          {ev.role}
                        </Text>
                      </HStack>
                    </VStack>
                    <ChevronRightIcon boxSize="1rem" color="fg.muted" aria-hidden />
                  </HStack>
                </Panel>
              </Link>
            ))}
          </VStack>
        )}
      </VStack>
      </PageContainer>
    </AppShell>
  );
}
