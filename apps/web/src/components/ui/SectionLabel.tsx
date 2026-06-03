import { Text } from "@yamada-ui/react/components/text";
import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="sm" fontWeight="medium" color="fg.muted">
      {children}
    </Text>
  );
}
