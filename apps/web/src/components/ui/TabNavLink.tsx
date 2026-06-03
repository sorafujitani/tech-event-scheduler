import { Link, type LinkProps } from "@tanstack/react-router";
import { Box } from "@yamada-ui/react/components/box";
import { Text } from "@yamada-ui/react/components/text";
import type { ReactNode } from "react";

type TabNavLinkProps = {
  icon: ReactNode;
  label: string;
} & Pick<LinkProps, "to" | "params" | "activeOptions">;

export function TabNavLink({ icon, label, ...linkProps }: TabNavLinkProps) {
  return (
    <Link {...linkProps} className="app-tab">
      <Box fontSize="1.125rem" lineHeight="1" aria-hidden>
        {icon}
      </Box>
      <Text fontSize="sm" lineHeight="short">
        {label}
      </Text>
    </Link>
  );
}
