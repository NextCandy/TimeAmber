import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

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
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
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
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/api/admin") &&
              !url.pathname.startsWith("/api/auth"),
            handler: "NetworkFirst",
            options: {
              cacheName: "timeamber-api",
              expiration: { maxEntries: 100, maxAgeSeconds: 10 * 60 },
              networkTimeoutSeconds: 10,
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
