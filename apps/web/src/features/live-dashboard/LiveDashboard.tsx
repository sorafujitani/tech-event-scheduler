import { Box } from "@yamada-ui/react/components/box";
import { VStack } from "@yamada-ui/react/components/stack";
import { CounterSection } from "./CounterSection";
import { ModuleCardGrid } from "./ModuleCardGrid";
import { TimerSection } from "./TimerSection";

function Divider() {
  return <Box borderTopWidth="1px" my="sm" />;
}

export function LiveDashboard({ eventId }: { eventId: string }) {
  return (
    <VStack gap="lg" p="md" pb="safeBottom" maxW="640px" mx="auto" align="stretch">
      <TimerSection eventId={eventId} />
      <Divider />
      <CounterSection eventId={eventId} />
      <Divider />
      <ModuleCardGrid eventId={eventId} />
    </VStack>
  );
}
