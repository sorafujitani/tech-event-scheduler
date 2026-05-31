import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <VStack
      p="lg"
      gap="md"
      maxW="640px"
      mx="auto"
      align="center"
      minH="50dvh"
      justify="center"
    >
      <Heading size="md">ページが見つかりません</Heading>
      <Text color="muted">URL をご確認ください。</Text>
      <Button as={Link} {...{ to: "/events" }} colorScheme="primary">
        イベント一覧へ
      </Button>
    </VStack>
  );
}
