import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { z } from "zod";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  return (
    <VStack p="xl" align="center" maxW="360px" mx="auto" gap="lg" minH="80dvh" justify="center">
      <Heading size="lg">tech-event-scheduler</Heading>
      <Text color="muted" textAlign="center">
        イベント当日運営ツール
      </Text>
      <Button
        colorScheme="primary"
        size="lg"
        w="full"
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: redirect ?? "/",
          })
        }
      >
        Google でサインイン
      </Button>
    </VStack>
  );
}
