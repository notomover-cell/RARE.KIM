import { defineConfig } from "vite";

// GitHub Pages demo build — produces a full page bundle (not the IIFE library)
export default defineConfig({
  root: ".",
  publicDir: "public",
  base: "./",
  build: {
    outDir: "docs/demo",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
  },
});
