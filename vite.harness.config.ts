import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// E2E harness: mounts the production gesture stack (usePageFlip +
// useSwipeTurn, wired exactly like PageReader) with synthetic colored pages.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  base: "./",
  build: { rollupOptions: { input: path.resolve(__dirname, "harness/index.html") } },
});
