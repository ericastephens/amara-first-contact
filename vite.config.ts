/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves the app from /<repo>/; set BASE_PATH in CI, "/" locally.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "models/*.json"],
      manifest: {
        name: "Amara First Contact",
        short_name: "Amara",
        description: "Offline referral and triage companion for mothers and children",
        theme_color: "#0f5c4d",
        background_color: "#ffffff",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        // App shell, bundled data/*.json and the intent model are all precached for offline use.
        globPatterns: ["**/*.{js,css,html,svg,json,mp3,webmanifest}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "index.html",
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
