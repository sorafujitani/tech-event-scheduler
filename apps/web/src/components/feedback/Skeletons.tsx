import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";

export function RouteSpinner() {
  return (
    <VStack minH="60dvh" align="center" justify="center" gap="md">
      <Text color="muted" aria-live="polite">
        読み込み中…
      </Text>
    </VStack>
  );
}

export function ListSkeleton() {
  return (
    <VStack p="lg" gap="md" maxW="640px" mx="auto">
      <Text color="muted" aria-live="polite">
        読み込み中…
      </Text>
    </VStack>
  );
}
