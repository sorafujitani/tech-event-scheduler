import { Box } from "@yamada-ui/react/components/box";
import { HStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import type { ConnectionState } from "../../lib/live/socket";

const VIEW: Record<
  ConnectionState,
  { label: string; dotColor: string; pulse?: boolean }
> = {
  connecting: { label: "接続中", dotColor: "live.off" },
  connected: { label: "Live", dotColor: "live.on", pulse: true },
  reconnecting: { label: "再接続", dotColor: "live.warn", pulse: true },
  offline: { label: "Offline", dotColor: "live.off" },
};

export type ConnectionChipProps = {
  state: ConnectionState;
  presenceCount?: number;
};

export function ConnectionChip({ state, presenceCount }: ConnectionChipProps) {
  const v = VIEW[state];

  return (
    <HStack gap="xs" align="center" aria-live="polite" flexShrink={0}>
      <Box
        boxSize="0.4375rem"
        rounded="full"
        bg={v.dotColor}
        className={v.pulse ? "live-pulse" : undefined}
        aria-hidden
      />
      <Text fontSize="xs" fontWeight="medium" color="fg.muted" whiteSpace="nowrap">
        {v.label}
        {presenceCount != null && presenceCount > 0 ? ` · ${presenceCount}` : ""}
      </Text>
    </HStack>
  );
}
