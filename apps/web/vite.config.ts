import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, type PluginOption } from "vite";

const enableVisualizer = process.env.ANALYZE === "1";

const visualizerPlugins: PluginOption[] = enableVisualizer
  ? [
      visualizer({
        filename: "dist/stats.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        emitFile: false,
        open: false,
      }) as unknown as PluginOption,
      visualizer({
        filename: "dist/stats.json",
        template: "raw-data",
        gzipSize: true,
        brotliSize: true,
        emitFile: false,
      }) as unknown as PluginOption,
    ]
  : [];

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    react(),
    ...visualizerPlugins,
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: false,
        // WebSocket Upgrade を api Worker へ転送する（EventRoom DO の /ws）。
        // 無いと dev で WS 接続が全く成立しない（契約 M6）。
        ws: true,
      },
    },
  },
});
