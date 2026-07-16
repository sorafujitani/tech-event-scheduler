import { Button, IconButton } from "@yamada-ui/react/components/button";
import { MinusIcon, PlusIcon } from "@yamada-ui/react/components/icon";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { TAP_VIBRATION_MS, vibrate } from "../../lib/vibrate";
import { Panel } from "../ui/Panel";

export type CounterControlProps = {
  value: number;
  capacity?: number | null;
  disabled?: boolean;
  onAdjust: (delta: number) => void;
  onReset: () => void;
};

export function CounterControl({
  value,
  capacity,
  disabled,
  onAdjust,
  onReset,
}: CounterControlProps) {
  const over = capacity != null && value > capacity;
  const tap = (d: number) => {
    vibrate(TAP_VIBRATION_MS);
    onAdjust(d);
  };
  const off = disabled ?? false;

  return (
    <Panel variant="elevated" p="lg">
      <VStack gap="md" align="stretch">
        <HStack gap="md" align="center" justify="space-between">
          <IconButton
            aria-label="1人減らす"
            rounded="full"
            boxSize="tapCounter"
            variant="outline"
            colorScheme="gray"
            disabled={off}
            onClick={() => tap(-1)}
            icon={<MinusIcon boxSize="1.25rem" />}
          />
          <VStack gap={0} align="center" flex={1}>
            <Text
              fontSize="3xl"
              fontWeight="700"
              fontFamily="mono"
              color={over ? "timer.overrun" : "timer.normal"}
              lineHeight="1"
              letterSpacing="timer"
            >
              {value}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              入場{capacity != null ? ` · 定員 ${capacity}` : ""}
            </Text>
          </VStack>
          <IconButton
            aria-label="1人増やす"
            rounded="full"
            boxSize="tapCounter"
            colorScheme="primary"
            disabled={off}
            onClick={() => tap(1)}
            icon={<PlusIcon boxSize="1.25rem" />}
          />
        </HStack>
        {over ? (
          <Text color="timer.overrun" fontWeight="medium" fontSize="sm" textAlign="center">
            定員超過
          </Text>
        ) : null}
        <HStack gap="xs" justify="center">
          <Button size="xs" variant="ghost" colorScheme="gray" disabled={off} onClick={() => tap(10)}>
            +10
          </Button>
          <Button size="xs" variant="ghost" colorScheme="red" onClick={onReset}>
            リセット
          </Button>
        </HStack>
      </VStack>
    </Panel>
  );
}
