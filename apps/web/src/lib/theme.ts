import { extendConfig, extendTheme } from "@yamada-ui/react/providers/ui-provider";
import {
  blueScale,
  darkScale,
  fontFamilyMono,
  fontFamilySans,
  grayScale,
  greenScale,
  orangeScale,
  redScale,
} from "./palette";

export const theme = extendTheme({
  colors: {
    blue: blueScale,
    gray: grayScale,
    red: redScale,
    green: greenScale,
    orange: orangeScale,
    dark: darkScale,
  },
  fonts: {
    body: fontFamilySans,
    heading: fontFamilySans,
    mono: fontFamilyMono,
  },
  fontWeights: {
    heading: 700,
  },
  lineHeights: {
    moderate: 1.5,
    tall: 1.65,
  },
  letterSpacings: {
    tight: "-0.025em",
    timer: "-0.04em",
  },
  radii: {
    xs: "0.25rem",
    sm: "0.375rem",
    md: "0.625rem",
    lg: "0.875rem",
    xl: "1rem",
    "2xl": "1.25rem",
    full: "9999px",
  },
  shadows: {
    xs: [
      "0 1px 2px rgba(16, 24, 40, 0.04)",
      "0 1px 2px rgba(0, 0, 0, 0.2)",
    ],
    sm: [
      "0 4px 16px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.04)",
      "0 4px 16px rgba(0, 0, 0, 0.25)",
    ],
  },
  semanticTokens: {
    colors: {
      "live.on": "green.6",
      "live.warn": "orange.6",
      "live.off": "gray.4",
      "timer.normal": ["gray.9", "dark.0"],
      "timer.soon": "orange.6",
      "timer.overrun": "red.6",
      "well.bg": ["gray.0", "dark.5"],
      bg: {
        base: ["gray.0", "dark.7"],
        panel: ["white", "dark.6"],
        subtle: ["gray.1", "dark.5"],
        muted: ["gray.1", "dark.5"],
        elevated: ["white", "dark.6"],
      },
      fg: {
        base: ["gray.9", "dark.0"],
        muted: ["gray.6", "dark.2"],
        subtle: ["gray.5", "dark.3"],
      },
      border: {
        base: ["gray.2", "dark.4"],
        muted: ["gray.2", "dark.4"],
        focus: ["blue.5", "blue.4"],
      },
      nav: {
        activeFg: ["blue.6", "blue.4"],
        bar: ["white", "dark.6"],
      },
    },
    colorSchemes: {
      primary: "blue",
      link: "blue",
      info: "blue",
    },
  },
  sizes: { tapMin: "44px", tapMain: "50px", tapCounter: "52px" },
  spaces: { safeBottom: "env(safe-area-inset-bottom)" },
  styles: {
    globalStyle: {
      "*, *::before, *::after": { fontVariantNumeric: "tabular-nums" },
      html: { fontSize: "100%", bg: "bg.base" },
      body: {
        bg: "bg.base",
        color: "fg.base",
        fontFamily: "body",
        lineHeight: "moderate",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      },
      ".app-tab": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.1875rem",
        minHeight: "2.75rem",
        fontWeight: "medium",
        fontSize: "0.625rem",
        color: "fg.muted",
        textDecoration: "none",
        transition: "color 150ms ease",
        rounded: "lg",
      },
      ".app-tab[data-status='active']": {
        color: "nav.activeFg",
        fontWeight: "semibold",
      },
      ".live-pulse": {
        animation: "live-pulse 2s ease-in-out infinite",
      },
      "@keyframes live-pulse": {
        "0%, 100%": { opacity: 1 },
        "50%": { opacity: 0.4 },
      },
    },
    layerStyles: {
      panel: {
        bg: "bg.panel",
        rounded: "xl",
      },
      surface: {
        bg: "bg.elevated",
        borderWidth: "1px",
        borderColor: "border.base",
        rounded: "2xl",
        boxShadow: "sm",
      },
      well: {
        bg: "well.bg",
        rounded: "xl",
        px: "lg",
        py: "xl",
      },
      glass: {
        bg: "nav.bar",
        borderBottomWidth: "1px",
        borderColor: "border.base",
      },
      navFloat: {
        bg: "nav.bar",
        borderWidth: "1px",
        borderColor: "border.base",
        rounded: "2xl",
        boxShadow: "sm",
      },
    },
  },
  components: {
    Button: {
      defaultProps: {
        rounded: "xl",
        fontWeight: "semibold",
      },
    },
    Badge: {
      defaultProps: {
        rounded: "full",
        fontWeight: "semibold",
      },
    },
    Input: {
      defaultProps: {
        rounded: "lg",
      },
    },
    Progress: {
      defaultProps: {
        rounded: "full",
        size: "sm",
      },
    },
  },
});

export const config = extendConfig({ defaultColorMode: "system" });
