import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const BRAND_ASSET_LIGHT_URL = "https://i.see.you/2026/04/28/jN4b/TimeAmberPNG.png";
const BRAND_ASSET_DARK_URL = "https://i.see.you/2026/04/28/o9fC/TimeAmberPNG-Dark.png";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "TimeAmber",
        short_name: "TimeAmber",
        description: "时光成珀，字字如初。",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        icons: [
          {
            src: BRAND_ASSET_LIGHT_URL,
            sizes: "any",
            type: "image/png"
          },
          {
            src: BRAND_ASSET_DARK_URL,
            sizes: "any",
            type: "image/png"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /\/cdn\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "timeamber-images",
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\/api\//i,
            handler: "NetworkFirst",
            options: {
              cacheName: "timeamber-api",
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/cdn": "http://localhost:8787",
      "/rss.xml": "http://localhost:8787",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    cssMinify: "lightningcss",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-markdown": ["marked", "dompurify"],
          "vendor-highlight": ["highlight.js/lib/core"],
          "vendor-katex": ["katex"],
          "vendor-react": ["react", "react-dom"],
          "vendor-ui": ["lucide-react", "wouter", "clsx", "class-variance-authority", "tailwind-merge"],
        },
      },
    },
  },
});
