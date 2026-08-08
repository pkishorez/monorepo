import type { ModuleSourceSnapshot } from 'laymos';
import { describe, expect, test } from 'vitest';

import { initialSourceFile } from './initial-selection';

const snapshot: ModuleSourceSnapshot = {
  modulePath: 'src/shared',
  entryPoint: 'src/shared/index.ts',
  files: [
    { path: 'src/shared/internal.ts', content: '' },
    { path: 'src/shared/index.ts', content: '' },
    { path: 'src/shared/public/index.ts', content: '' },
  ],
};

describe('initialSourceFile', () => {
  test('prefers the requested nested public entry point', () => {
    expect(initialSourceFile(snapshot, 'src/shared/public/index.ts')).toBe(
      'src/shared/public/index.ts',
    );
  });

  test('uses the root public entry point by default', () => {
    expect(initialSourceFile(snapshot)).toBe('src/shared/index.ts');
  });

  test('falls back to the first file for an Unexposed Module', () => {
    expect(initialSourceFile({ ...snapshot, entryPoint: undefined })).toBe(
      'src/shared/index.ts',
    );
  });
});
