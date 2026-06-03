import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { Link } from "@tanstack/react-router";
import { PageContainer } from "../layout/PageContainer";
import { Panel } from "../ui/Panel";

export function NotFound() {
  return (
    <PageContainer>
      <VStack gap="md" align="center" minH="50dvh" justify="center">
        <Panel variant="elevated" p="xl" maxW="420px" w="full">
          <VStack gap="md" align="center">
            <Heading size="lg" fontWeight="bold">
              ページが見つかりません
            </Heading>
            <Text color="fg.muted" textAlign="center">
              URL をご確認ください。
            </Text>
            <Button as={Link} {...{ to: "/events" }} colorScheme="primary">
              イベント一覧へ
            </Button>
          </VStack>
        </Panel>
      </VStack>
    </PageContainer>
  );
}
