import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
    // Show test details
    logHeapUsage: true,
    // Enhanced test timeout for integration tests
    testTimeout: 10000,
  },
});
