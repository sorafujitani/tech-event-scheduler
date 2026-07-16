import { Box } from "@yamada-ui/react/components/box";
import { HStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { LinkBox } from "./LinkButton";

export function AppLogo() {
  return (
    <LinkBox
      to="/events"
      textDecoration="none"
      _hover={{ opacity: 0.85 }}
      transition="opacity 150ms ease"
    >
      <HStack gap="sm" align="center">
        <Box
          boxSize="1.75rem"
          rounded="md"
          bg="blue.6"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          boxShadow="xs"
          aria-hidden
        >
          <Text fontSize="xs" fontWeight="bold" color="white" lineHeight="1">
            ES
          </Text>
        </Box>
        <Text fontWeight="bold" fontSize="md" color="fg.base" lineHeight="shorter" letterSpacing="tight">
          Event{" "}
          <Text as="span" color="blue.6">
            Scheduler
          </Text>
        </Text>
      </HStack>
    </LinkBox>
  );
}
