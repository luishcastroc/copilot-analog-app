/// <reference types="vite/client" />
import analog from "@analogjs/platform";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  build: {
    target: ["es2022"],
  },
  resolve: {
    // Keep "browser" first so packages with browser-specific builds (e.g. the
    // debug/supports-color loggers inside CopilotKit's deps) don't ship their
    // Node builds — those crash on Node globals like tty.isatty and process.
    mainFields: ["browser", "module"],
  },
  plugins: [
    analog({
      // The app is a client-rendered SPA (the CopilotKit chat components are
      // not SSR-safe). Server routes under src/server/routes still run in
      // Nitro — that's where the Copilot Runtime lives.
      ssr: false,
      prerender: { routes: [] },
    }),
  ],
}));
