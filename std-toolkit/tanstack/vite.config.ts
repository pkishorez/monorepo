import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  // @ts-ignore
  test: {
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
