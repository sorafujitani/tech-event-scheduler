import { Button } from "@yamada-ui/react/components/button";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";

export type CounterControlProps = {
  value: number; // 表示値（確定 + 楽観 overlay）
  capacity?: number | null;
  disabled?: boolean;
  onAdjust: (delta: number) => void; // Idempotency-Key は呼び出し側(useAdjustCounter)で発番
  onReset: () => void; // reset 専用 API（adjust の -value 代用禁止）
  onHistory?: () => void;
};

function vibrate(ms: number) {
  const nav = navigator as Navigator & { vibrate?: (p: number) => boolean };
  if (typeof nav.vibrate === "function") nav.vibrate(ms);
}

// ＋右 / −左（右手親指の弧）。中央 6xl mono。aria-label 必須。絶対値 PUT 禁止＝delta 送信。
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
  return (
    <VStack gap="sm" align="center">
      <HStack gap="xl" align="center" justify="center">
        <Button
          aria-label="1人減らす"
          rounded="full"
          boxSize="tapCounter"
          fontSize="2xl"
          variant="outline"
          disabled={disabled ?? false}
          onClick={() => tap(-1)}
        >
          −
        </Button>
        <VStack gap={0} align="center" minW="6rem">
          <Text
            fontSize="6xl"
            fontWeight="black"
            fontFamily="mono"
            color={over ? "timer.overrun" : "timer.normal"}
            lineHeight="1"
          >
            {value}
          </Text>
          <Text fontSize="sm" color="muted">
            入場済み{capacity != null ? ` / 定員 ${capacity}` : ""}
          </Text>
        </VStack>
        <Button
          aria-label="1人増やす"
          rounded="full"
          boxSize="tapCounter"
          fontSize="2xl"
          colorScheme="primary"
          disabled={disabled ?? false}
          onClick={() => tap(1)}
        >
          ＋
        </Button>
      </HStack>
      {over ? (
        <Text color="timer.overrun" fontWeight="bold">
          ⚠ 定員超過
        </Text>
      ) : null}
      <HStack gap="sm">
        <Button size="sm" variant="outline" disabled={disabled ?? false} onClick={() => tap(10)}>
          +10
        </Button>
        {onHistory ? (
          <Button size="sm" variant="ghost" onClick={onHistory}>
            履歴
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" colorScheme="red" onClick={onReset}>
          リセット
        </Button>
      </HStack>
    </VStack>
  );
}
