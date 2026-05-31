import { Box } from "@yamada-ui/react/components/box";
import { useEventDetail } from "../../hooks/useEventDetail";
import { resolveActiveModules } from "../../modules/registry";

// event_module を registry で動的描画（§5.2）。LiveCard を持つモジュールのみカード化。
// MVP の timetable/attendance は LiveCard を持たない（Live タブの専用セクションが担う）→ 空。
export function ModuleCardGrid({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const enabled = (data?.modules ?? [])
    .filter((m) => m.enabled)
    .map((m) => ({ moduleType: m.moduleType, orderIndex: m.orderIndex }));
  const cards = resolveActiveModules(enabled).filter((a) => a.module.LiveCard);
  if (cards.length === 0) return null;
  return (
    <Box
      display="grid"
      gridTemplateColumns="repeat(2, 1fr)"
      gap="md"
    >
      {cards.map(({ moduleType, module }) => {
        const Card = module.LiveCard;
        return Card ? (
          <Card key={moduleType} eventId={eventId} snapshot={undefined} />
        ) : null;
      })}
    </Box>
  );
}
