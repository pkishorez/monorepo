import { describe, expect, test } from 'vitest';

import { initialSourceFile } from './initial-selection';

const files = [
  { path: 'src/shared/internal.ts', content: '' },
  { path: 'src/shared/index.ts', content: '' },
  { path: 'src/shared/public/index.ts', content: '' },
];
const entryPoint = 'src/shared/index.ts';

describe('initialSourceFile', () => {
  test('prefers the requested Subpath', () => {
    expect(
      initialSourceFile(files, entryPoint, 'src/shared/public/index.ts'),
    ).toBe('src/shared/public/index.ts');
  });

  test('uses the root public entry point by default', () => {
    expect(initialSourceFile(files, entryPoint)).toBe('src/shared/index.ts');
  });

  test('falls back to the first file for an Entry Module', () => {
    expect(initialSourceFile(files, undefined)).toBe('src/shared/index.ts');
  });
});
