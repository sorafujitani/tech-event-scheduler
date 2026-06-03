import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import type { ReactNode } from "react";
import { Panel } from "./Panel";

export function EmptyState(props: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Panel variant="elevated" p="xl">
      <VStack gap="sm" align="center" textAlign="center">
        <Text fontWeight="semibold" fontSize="md" color="fg.base">
          {props.title}
        </Text>
        {props.description ? (
          <Text color="fg.muted" fontSize="sm" lineHeight="tall">
            {props.description}
          </Text>
        ) : null}
        {props.action}
      </VStack>
    </Panel>
  );
}
