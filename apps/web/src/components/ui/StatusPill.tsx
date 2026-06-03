import { Box } from "@yamada-ui/react/components/box";
import { HStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";

const DOT: Record<
  "gray" | "green" | "orange" | "red",
  "gray.5" | "green.6" | "orange.6" | "red.6"
> = {
  gray: "gray.5",
  green: "green.6",
  orange: "orange.6",
  red: "red.6",
};

export function StatusPill(props: {
  label: string;
  colorScheme: "gray" | "green" | "orange" | "red";
  pulse?: boolean;
}) {
  return (
    <HStack gap="xs" align="center">
      <Box
        boxSize="0.5rem"
        rounded="full"
        bg={DOT[props.colorScheme]}
        className={props.pulse ? "live-pulse" : undefined}
        aria-hidden
      />
      <Text fontSize="sm" fontWeight="medium" color="fg.base">
        {props.label}
      </Text>
    </HStack>
  );
}
