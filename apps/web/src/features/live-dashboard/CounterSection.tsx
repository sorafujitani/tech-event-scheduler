import { Text } from "@yamada-ui/react/components/text";
import { CounterControl } from "../../components/counter/CounterControl";
import { useConfirmUndo } from "../../components/feedback/ConfirmUndo";
import {
  useCounter,
  useOptimisticCounterValue,
} from "../../lib/live/react/hooks";
import { useAdjustCounter, useResetCounter } from "../../hooks/mutations/useCounterOps";
import { useEventDetail } from "../../hooks/useEventDetail";

export function CounterSection({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const counter = data?.counters?.[0]; // MVP は既定の main カウンタ
  if (!counter) {
    return <Text color="fg.muted">カウンタが設定されていません。</Text>;
  }
  return <CounterSectionInner eventId={eventId} counterId={counter.id} />;
}

function CounterSectionInner({
  eventId,
  counterId,
}: {
  eventId: string;
  counterId: string;
}) {
  const value = useOptimisticCounterValue(counterId);
  const live = useCounter(counterId);
  const adjust = useAdjustCounter(eventId, counterId);
  const reset = useResetCounter(eventId, counterId);
  const { run: confirmUndo } = useConfirmUndo();
  return (
    <CounterControl
      value={value}
      capacity={live?.capacity ?? null}
      onAdjust={(d) => adjust.mutate(d)}
      onReset={() =>
        confirmUndo("入場者数をリセットしました", () => reset.mutate())
      }
    />
  );
}
