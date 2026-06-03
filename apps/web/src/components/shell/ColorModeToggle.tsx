import { IconButton } from "@yamada-ui/react/components/button";
import { MoonIcon, SunIcon } from "@yamada-ui/react/components/icon";
import { useColorMode } from "@yamada-ui/react/core";

export function ColorModeToggle() {
  const { colorMode, toggleColorMode } = useColorMode();
  const isDark = colorMode === "dark";

  return (
    <IconButton
      variant="ghost"
      size="sm"
      colorScheme="gray"
      aria-label={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      onClick={toggleColorMode}
      icon={isDark ? <SunIcon boxSize="1.125rem" /> : <MoonIcon boxSize="1.125rem" />}
    />
  );
}
