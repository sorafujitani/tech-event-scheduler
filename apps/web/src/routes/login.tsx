import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { VStack } from "@yamada-ui/react/components/stack";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  return (
    <VStack p={8} align="center" maxW="320px" mx="auto">
      <Heading size="lg">Sign in</Heading>
      <Button
        colorScheme="primary"
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: "/",
          })
        }
      >
        Continue with Google
      </Button>
    </VStack>
  );
}
