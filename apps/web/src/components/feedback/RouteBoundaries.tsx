import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { PageContainer } from "../layout/PageContainer";
import { Panel } from "../ui/Panel";

function ErrorView(props: {
  title: string;
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <PageContainer>
      <VStack gap="md" align="center" minH="50dvh" justify="center">
        <Panel variant="elevated" p="xl" maxW="420px" w="full">
          <VStack gap="md" align="center">
            <Heading size="lg" fontWeight="bold">
              {props.title}
            </Heading>
            {props.message ? (
              <Text color="fg.muted" textAlign="center">
                {props.message}
              </Text>
            ) : null}
            {props.onRetry ? (
              <Button colorScheme="primary" onClick={props.onRetry}>
                再試行
              </Button>
            ) : null}
          </VStack>
        </Panel>
      </VStack>
    </PageContainer>
  );
}

export function RouteError({
  error,
  reset,
}: {
  error: Error;
  reset?: () => void;
}) {
  return (
    <ErrorView
      title="エラーが発生しました"
      message={error.message}
      onRetry={reset}
    />
  );
}

export function AppErrorBoundary({ error }: { error: Error }) {
  return (
    <ErrorView
      title="問題が発生しました"
      message={error.message}
      onRetry={() => location.reload()}
    />
  );
}
