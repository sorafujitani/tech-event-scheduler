import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import type { ReactNode } from "react";

export function Field(props: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <VStack gap="xs" align="stretch">
      <Text fontSize="sm" fontWeight="medium">
        {props.label}
      </Text>
      {props.children}
      {props.error ? (
        <Text color="red.600" fontSize="sm">
          {props.error}
        </Text>
      ) : props.hint ? (
        <Text color="fg.muted" fontSize="sm">
          {props.hint}
        </Text>
      ) : null}
    </VStack>
  );
}
