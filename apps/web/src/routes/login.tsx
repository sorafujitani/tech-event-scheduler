import { createFileRoute } from "@tanstack/react-router";
import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { Text } from "@yamada-ui/react/components/text";
import { VStack } from "@yamada-ui/react/components/stack";
import { z } from "zod";
import { AppLogo } from "../components/ui/AppLogo";
import { Panel } from "../components/ui/Panel";
import { ColorModeToggle } from "../components/shell/ColorModeToggle";
import { ShellHeader } from "../components/shell/ShellHeader";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();

  return (
    <Box minH="100dvh" bg="bg.base">
      <ShellHeader start={<AppLogo />} end={<ColorModeToggle />} />
      <VStack
        align="center"
        maxW="400px"
        mx="auto"
        gap="xl"
        minH="calc(100dvh - 3.5rem)"
        justify="center"
        px="md"
        py="2xl"
      >
        <VStack gap="sm" align="center" textAlign="center">
          <Heading size="2xl" fontWeight="bold" letterSpacing="tight">
            サインイン
          </Heading>
          <Text color="fg.muted" fontSize="sm" lineHeight="tall">
            テックイベントの進行管理・Live 運営
          </Text>
        </VStack>

        <Panel variant="elevated" p="xl" w="full">
          <Button
            colorScheme="primary"
            size="lg"
            w="full"
            minH="tapMain"
            onClick={() =>
              authClient.signIn.social({
                provider: "google",
                callbackURL: redirect ?? "/",
              })
            }
          >
            Google でサインイン
          </Button>
        </Panel>
      </VStack>
    </Box>
  );
}
