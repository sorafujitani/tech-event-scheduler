import { Box } from "@yamada-ui/react/components/box";
import type { ComponentProps } from "react";

type PanelProps = ComponentProps<typeof Box> & {
  variant?: "flat" | "elevated" | "interactive" | "ghost";
};

export function Panel({ variant = "flat", ...props }: PanelProps) {
  const interactive =
    variant === "interactive"
      ? {
          layerStyle: "surface" as const,
          transition: "box-shadow 200ms ease, transform 200ms ease",
          cursor: "pointer",
          _hover: { boxShadow: "sm", transform: "translateY(-1px)" },
          _active: { transform: "translateY(0)" },
        }
      : {};

  if (variant === "ghost") {
    return <Box borderWidth={0} bg="transparent" {...props} />;
  }

  const layerStyle = variant === "elevated" ? "surface" : "panel";

  return <Box layerStyle={layerStyle} {...interactive} {...props} />;
}
