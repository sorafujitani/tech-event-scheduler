import { HStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import type { ConnectionState } from "../../lib/live/socket";

const VIEW: Record<
  ConnectionState,
  { dot: string; label: string; color: string }
> = {
  connecting: { dot: "○", label: "接続中", color: "live.off" },
  connected: { dot: "●", label: "LIVE", color: "live.on" },
  reconnecting: { dot: "⟳", label: "再接続中", color: "live.warn" },
  offline: { dot: "○", label: "オフライン", color: "live.off" },
};

export type ConnectionChipProps = {
  state: ConnectionState;
  presenceCount?: number;
};

// 色+アイコン+テキスト併記（色のみ非依存）。aria-live="polite"。
export function ConnectionChip({ state, presenceCount }: ConnectionChipProps) {
  const v = VIEW[state];
  return (
    <HStack gap="xs" aria-live="polite">
      <Text color={v.color} fontWeight="bold" aria-hidden>
        {v.dot}
      </Text>
      <Text fontSize="sm" fontWeight="medium">
        {v.label}
      </Text>
      {presenceCount != null && presenceCount > 0 ? (
        <Text fontSize="sm" color="muted">
          · {presenceCount}人
        </Text>
      ) : null}
    </HStack>
  );
}
