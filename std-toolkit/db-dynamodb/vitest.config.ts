import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
    outputFile: {
      junit: './test-results.xml',
    },
    // Show test details
    logHeapUsage: true,
    // Enhanced test timeout for integration tests
    testTimeout: 10000,
    // Better error output - suppress setup logs but keep test output
    onConsoleLog(log: string): false | void {
      if (log.includes('✅ Table') || log.includes('dotenv')) return false;
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        'src/**/*.test.*',
      ],
    },
  },
});
