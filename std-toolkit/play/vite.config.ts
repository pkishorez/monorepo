import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  build: {
    outDir: "dist/client",
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  // @ts-ignore
  test: {
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
