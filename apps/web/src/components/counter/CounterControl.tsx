import { Button, IconButton } from "@yamada-ui/react/components/button";
import { MinusIcon, PlusIcon } from "@yamada-ui/react/components/icon";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { Panel } from "../ui/Panel";

export type CounterControlProps = {
  value: number;
  capacity?: number | null;
  disabled?: boolean;
  onAdjust: (delta: number) => void;
  onReset: () => void;
  onHistory?: () => void;
};

function vibrate(ms: number) {
  const nav = navigator as Navigator & { vibrate?: (p: number) => boolean };
  if (typeof nav.vibrate === "function") nav.vibrate(ms);
}

export function CounterControl({
  value,
  capacity,
  disabled,
  onAdjust,
  onReset,
  onHistory,
}: CounterControlProps) {
  const over = capacity != null && value > capacity;
  const tap = (d: number) => {
    vibrate(10);
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
          {onHistory ? (
            <Button size="xs" variant="ghost" colorScheme="gray" onClick={onHistory}>
              履歴
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" colorScheme="red" onClick={onReset}>
            リセット
          </Button>
        </HStack>
      </VStack>
    </Panel>
  );
}
