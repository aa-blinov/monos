import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
  },
  server: {
    // Loopback only: the API has no authentication, so the dev server must not be
    // reachable from other machines. Pass --host to share it on purpose.
    host: "localhost",
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
