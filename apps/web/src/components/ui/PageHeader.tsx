import { Heading } from "@yamada-ui/react/components/heading";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import type { ReactNode } from "react";

export function PageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <HStack justify="space-between" align="flex-end" gap="md">
      <VStack gap="xs" align="start" minW={0}>
        <Heading
          size="xl"
          fontWeight="bold"
          lineHeight="shorter"
          letterSpacing="tight"
        >
          {props.title}
        </Heading>
        {props.description ? (
          <Text color="fg.muted" fontSize="sm" lineHeight="tall" maxW="36rem">
            {props.description}
          </Text>
        ) : null}
      </VStack>
      {props.actions ? <HStack flexShrink={0} pb="xs">{props.actions}</HStack> : null}
    </HStack>
  );
}
