import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The Content-Security-Policy belongs to the production build: the app loads nothing
// from third parties and runs no inline script, so the policy only blocks what it
// should. In development it would also block design-review overlays and other dev
// tools that load scripts from localhost, so the dev server serves no policy.
const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'";

function contentSecurityPolicy() {
  return {
    name: "monos-content-security-policy",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("</head>", `    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [svelte(), contentSecurityPolicy()],
  // Under vitest, Svelte would resolve to its server build, where onMount never runs.
  // Components in jsdom must get the browser build, as they do in the app.
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
  },
  // Modules that are only imported when a feature is first used (the terminal, the map) are bundled at start. Left to
  // be found on first use, the dev server bundles them then and reloads the page, which drops what was on screen.
  optimizeDeps: {
    include: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search', '@xterm/addon-web-links', 'd3-force'],
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
