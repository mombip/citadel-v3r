import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  root: "web",
  plugins: [svelte()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: { "/api": { target: `http://localhost:${process.env.PORT || 8700}`, changeOrigin: true } },
  },
});
