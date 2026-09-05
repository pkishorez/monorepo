import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.alchemy/**',
      '**/.tanstack/**',
      '**/*.gen.ts',
    ],
  },
  fmt: {
    printWidth: 80,
    tabWidth: 2,
    semi: true,
    singleQuote: true,
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.alchemy/**',
      '**/.tanstack/**',
      '**/*.gen.ts',
      '**/package.json',
    ],
  },
});
