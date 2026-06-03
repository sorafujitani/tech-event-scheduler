import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient } from "../../lib/auth-client";
import { AppLogo } from "../ui/AppLogo";
import { ColorModeToggle } from "./ColorModeToggle";
import { ShellHeader } from "./ShellHeader";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const logout = async () => {
    await authClient.signOut();
    await router.navigate({ to: "/login" });
  };

  return (
    <Box minH="100dvh" bg="bg.base">
      <ShellHeader
        start={<AppLogo />}
        end={
          <>
            <ColorModeToggle />
            <Button size="sm" variant="subtle" colorScheme="gray" onClick={() => void logout()}>
              ログアウト
            </Button>
          </>
        }
      />
      <Box as="main" pb="safeBottom">
        {children}
      </Box>
    </Box>
  );
}
