import { Outlet } from "@tanstack/react-router";
import { Box } from "@yamada-ui/react/components/box";
import {
  CalendarIcon,
  ChevronLeftIcon,
  SettingsIcon,
  TimerIcon,
  UsersIcon,
} from "@yamada-ui/react/components/icon";
import { Text } from "@yamada-ui/react/components/text";
import { HStack } from "@yamada-ui/react/components/stack";
import { ConfirmUndoProvider } from "../../components/feedback/ConfirmUndo";
import { LinkIconButton } from "../../components/ui/LinkButton";
import { TabNavLink } from "../../components/ui/TabNavLink";
import { ColorModeToggle } from "../../components/shell/ColorModeToggle";
import { ConnectionChip } from "../../components/shell/ConnectionChip";
import { ShellHeader } from "../../components/shell/ShellHeader";
import { useEventDetail } from "../../hooks/useEventDetail";
import { useConnectionState, usePresence } from "../../lib/live/react/hooks";

export function EventDetailTabsShell({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const conn = useConnectionState();
  const presence = usePresence();

  return (
    <ConfirmUndoProvider>
      <Box minH="100dvh" bg="bg.base">
        <ShellHeader
          start={
            <HStack gap="sm" minW={0} align="center">
              <LinkIconButton
                to="/events"
                variant="ghost"
                colorScheme="gray"
                size="sm"
                rounded="lg"
                aria-label="一覧へ戻る"
                icon={<ChevronLeftIcon boxSize="1.125rem" />}
              />
              <Text fontWeight="semibold" fontSize="md" truncated>
                {data?.event.title ?? "…"}
              </Text>
            </HStack>
          }
          end={
            <>
              <ConnectionChip state={conn} presenceCount={presence} />
              <ColorModeToggle />
            </>
          }
        />

        <Box as="main" pb="calc(5rem + env(safe-area-inset-bottom))">
          <Outlet />
        </Box>

        <Box
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          px="md"
          pb="calc(0.75rem + env(safe-area-inset-bottom))"
          pointerEvents="none"
        >
          <Box
            as="nav"
            aria-label="主要ナビ"
            layerStyle="navFloat"
            display="flex"
            px="xs"
            py="xs"
            pointerEvents="auto"
          >
            <TabNavLink
              to="/events/$eventId"
              params={{ eventId }}
              activeOptions={{ exact: true }}
              icon={<TimerIcon boxSize="1.125rem" />}
              label="Live"
            />
            <TabNavLink
              to="/events/$eventId/timetable"
              params={{ eventId }}
              icon={<CalendarIcon boxSize="1.125rem" />}
              label="進行表"
            />
            <TabNavLink
              to="/events/$eventId/members"
              params={{ eventId }}
              icon={<UsersIcon boxSize="1.125rem" />}
              label="メンバー"
            />
            <TabNavLink
              to="/events/$eventId/settings"
              params={{ eventId }}
              icon={<SettingsIcon boxSize="1.125rem" />}
              label="設定"
            />
          </Box>
        </Box>
      </Box>
    </ConfirmUndoProvider>
  );
}
