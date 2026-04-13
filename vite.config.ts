import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => ({
  root: ".",
  publicDir: "public",
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: mode !== "production",
    lib: {
      entry: resolve(__dirname, "src/module/camera-module.ts"),
      name: "CameraModule",
      formats: ["iife"],
      fileName: () => "camera-module.iife.js",
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
}));
