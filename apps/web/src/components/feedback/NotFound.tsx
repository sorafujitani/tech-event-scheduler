import { Heading } from "@yamada-ui/react/components/heading";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { PageContainer } from "../layout/PageContainer";
import { LinkButton } from "../ui/LinkButton";
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
            <LinkButton to="/events" colorScheme="primary">
              イベント一覧へ
            </LinkButton>
          </VStack>
        </Panel>
      </VStack>
    </PageContainer>
  );
}
