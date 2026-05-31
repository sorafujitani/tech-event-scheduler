import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";

function ErrorView(props: {
  title: string;
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <VStack p="lg" gap="md" maxW="640px" mx="auto" align="center" minH="50dvh" justify="center">
      <Heading size="md">{props.title}</Heading>
      {props.message ? <Text color="muted">{props.message}</Text> : null}
      {props.onRetry ? (
        <Button colorScheme="primary" onClick={props.onRetry}>
          再試行
        </Button>
      ) : null}
    </VStack>
  );
}

// route の defaultErrorComponent。401 は _authed ガードが先に弾くため主に 403/500/network。
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

// root の errorComponent（致命的）。
export function AppErrorBoundary({ error }: { error: Error }) {
  return (
    <ErrorView
      title="問題が発生しました"
      message={error.message}
      onRetry={() => location.reload()}
    />
  );
}
