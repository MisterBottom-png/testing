import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    alias: {
      "@corners/game-core": fileURLToPath(
        new URL("../../packages/game-core/src/index.ts", import.meta.url),
      ),
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg", "icons/icon-maskable.svg"],
      manifest: {
        name: "Уголки Online",
        short_name: "Уголки",
        description: "Мобильная мультиплеерная игра в уголки",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        background_color: "#10131a",
        theme_color: "#695cff",
        icons: [
          {
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml"
          },
          {
            src: "icons/icon-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      }
    })
  ],
  server: {
    port: 5173
  }
});
