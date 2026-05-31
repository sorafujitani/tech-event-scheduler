import { extendConfig, extendTheme } from "@yamada-ui/react/providers/ui-provider";

// 屋外ハイコントラスト + タップターゲット + 等幅数字。色のみ依存を避け形/ラベル併用（§5.1）。
export const theme = extendTheme({
  semanticTokens: {
    colors: {
      "live.on": "green.500",
      "live.warn": "yellow.500",
      "live.off": "gray.500",
      "timer.soon": "orange.500",
      "timer.overrun": "red.500",
    },
  },
  sizes: { tapMin: "48px", tapMain: "64px", tapCounter: "72px" },
  spaces: { safeBottom: "env(safe-area-inset-bottom)" },
  styles: {
    globalStyle: { "*": { fontVariantNumeric: "tabular-nums" } },
  },
});

export const config = extendConfig({ defaultColorMode: "system" }); // ColorMode 端末追従
