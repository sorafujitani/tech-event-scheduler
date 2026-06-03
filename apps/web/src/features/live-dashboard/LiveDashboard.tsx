import { VStack } from "@yamada-ui/react/components/stack";
import type { ReactNode } from "react";
import { PageContainer } from "../../components/layout/PageContainer";
import { CounterSection } from "./CounterSection";
import { ModuleCardGrid } from "./ModuleCardGrid";
import { TimerSection } from "./TimerSection";

export function LiveDashboard({ eventId }: { eventId: string }) {
  return (
    <PageContainer compact>
      <VStack gap="md" align="stretch" pb="safeBottom">
        <TimerSection eventId={eventId} />
        <CounterSection eventId={eventId} />
        <ModuleCardGrid eventId={eventId} />
      </VStack>
    </PageContainer>
  );
}
