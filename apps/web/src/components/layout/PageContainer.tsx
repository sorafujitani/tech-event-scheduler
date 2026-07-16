import { Box } from "@yamada-ui/react/components/box";
import type { ReactNode } from "react";

export function PageContainer(props: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <Box
      maxW="40rem"
      mx="auto"
      px={{ base: "md", sm: "lg" }}
      py={props.compact ? "lg" : "xl"}
      w="full"
    >
      {props.children}
    </Box>
  );
}
