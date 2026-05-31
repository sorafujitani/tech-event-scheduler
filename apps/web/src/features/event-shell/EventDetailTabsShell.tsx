import { Link, Outlet } from "@tanstack/react-router";
import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { HStack } from "@yamada-ui/react/components/stack";
import type { CSSProperties, ReactNode } from "react";
import { ConfirmUndoProvider } from "../../components/feedback/ConfirmUndo";
import { ConnectionChip } from "../../components/shell/ConnectionChip";
import { useEventDetail } from "../../hooks/useEventDetail";
import { useConnectionState, usePresence } from "../../lib/live/react/hooks";

const tabStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  minHeight: 56,
  justifyContent: "center",
  fontSize: "0.7rem",
};
const tabActive: CSSProperties = { fontWeight: 700 };

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: "1.15rem" }} aria-hidden>
      {children}
    </span>
  );
}

export function EventDetailTabsShell({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const conn = useConnectionState();
  const presence = usePresence();

  return (
    <ConfirmUndoProvider>
      <Box minH="100dvh">
      <HStack
        as="header"
        px="md"
        py="sm"
        justify="space-between"
        borderBottomWidth="1px"
        position="sticky"
        top={0}
        bg={["white", "black"]}
        zIndex={10}
      >
        <HStack gap="xs" minW={0}>
          <Button
            as={Link}
            {...{ to: "/events" }}
            variant="ghost"
            size="sm"
            aria-label="一覧へ戻る"
          >
            ◀
          </Button>
          <Heading size="md" truncated>
            {data?.event.title ?? "…"}
          </Heading>
        </HStack>
        <ConnectionChip state={conn} presenceCount={presence} />
      </HStack>

      <Box as="main" pb="calc(72px + env(safe-area-inset-bottom))">
        <Outlet />
      </Box>

      <Box
        as="nav"
        aria-label="主要ナビ"
        position="fixed"
        bottom={0}
        left={0}
        right={0}
        borderTopWidth="1px"
        bg={["white", "black"]}
        pb="safeBottom"
        display="flex"
      >
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          activeOptions={{ exact: true }}
          activeProps={{ style: tabActive }}
          style={tabStyle}
        >
          <TabIcon>⏱</TabIcon>
          Live
        </Link>
        <Link
          to="/events/$eventId/timetable"
          params={{ eventId }}
          activeProps={{ style: tabActive }}
          style={tabStyle}
        >
          <TabIcon>🗓</TabIcon>
          進行表
        </Link>
        <Link
          to="/events/$eventId/members"
          params={{ eventId }}
          activeProps={{ style: tabActive }}
          style={tabStyle}
        >
          <TabIcon>👥</TabIcon>
          メンバー
        </Link>
        <Link
          to="/events/$eventId/settings"
          params={{ eventId }}
          activeProps={{ style: tabActive }}
          style={tabStyle}
        >
          <TabIcon>⚙</TabIcon>
          設定
        </Link>
      </Box>
      </Box>
    </ConfirmUndoProvider>
  );
}
