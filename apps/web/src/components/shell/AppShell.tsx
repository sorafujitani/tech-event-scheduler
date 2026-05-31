import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { HStack } from "@yamada-ui/react/components/stack";
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient } from "../../lib/auth-client";

// Phase3 はグローバルな最小シェル（ヘッダ + content）。イベント当日運営の
// 下部タブ/接続チップ/タイマーは Phase4 の EventDetailTabsShell が担う。
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const logout = async () => {
    await authClient.signOut();
    await router.navigate({ to: "/login" });
  };
  return (
    <Box minH="100dvh">
      <HStack
        as="header"
        px="md"
        py="sm"
        borderBottomWidth="1px"
        justify="space-between"
      >
        <Heading as={Link} {...{ to: "/events" }} size="md">
          tech-event-scheduler
        </Heading>
        <Button size="sm" variant="ghost" onClick={() => void logout()}>
          ログアウト
        </Button>
      </HStack>
      <Box as="main" pb="safeBottom">
        {children}
      </Box>
    </Box>
  );
}
