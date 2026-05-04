import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Heading, VStack } from "@yamada-ui/react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <VStack p={8} maxW="640px" mx="auto">
      <Heading>tech-event-scheduler</Heading>
      <Button as={Link} to="/login">
        Sign in
      </Button>
    </VStack>
  );
}
