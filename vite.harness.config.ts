import path from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// E2E harness: mounts the production gesture stack (usePageFlip +
// useSwipeTurn, wired exactly like PageReader) with synthetic colored pages.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  base: "./",
  build: { outDir: 'dist-harness', rollupOptions: { input: {
    main: path.resolve(__dirname, "harness/index.html"),
    profile: path.resolve(__dirname, "harness/profile.html"),
  } } },
});
