import { Box } from "@yamada-ui/react/components/box";
import { HStack } from "@yamada-ui/react/components/stack";
import type { ReactNode } from "react";

export function ShellHeader(props: { start: ReactNode; end?: ReactNode }) {
  return (
    <HStack
      as="header"
      h="3.25rem"
      px={{ base: "md", sm: "lg" }}
      layerStyle="glass"
      justify="space-between"
      gap="md"
      position="sticky"
      top={0}
      zIndex={100}
    >
      <Box minW={0} flex={1}>
        {props.start}
      </Box>
      {props.end ? (
        <HStack gap="sm" flexShrink={0} align="center">
          {props.end}
        </HStack>
      ) : null}
    </HStack>
  );
}
