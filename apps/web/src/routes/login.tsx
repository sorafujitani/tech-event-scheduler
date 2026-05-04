import { createFileRoute } from "@tanstack/react-router";
import { Button, Heading, VStack } from "@yamada-ui/react";
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
