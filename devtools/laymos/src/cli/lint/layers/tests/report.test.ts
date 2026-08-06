import { describe, expect, test } from 'vitest';

import { renderLayerReport } from '../report.js';

const ansiEscapeCodes = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

function plain(rendered: string): string {
  return rendered.replace(ansiEscapeCodes, '');
}

describe('renderLayerReport', () => {
  test('renders a clean result', () => {
    expect(
      plain(renderLayerReport({ unassignedFiles: [], forbiddenImports: [] })),
    ).toBe('✓ No layer violations');
  });

  test('groups forbidden imports by Layer pair without tree connectors', () => {
    const rendered = renderLayerReport({
      unassignedFiles: ['src/shared/log.ts'],
      forbiddenImports: [
        {
          fromFile: 'src/app/user.ts',
          fromLayer: 'app',
          toFile: 'src/infrastructure/cache.ts',
          toLayer: 'infrastructure',
        },
        {
          fromFile: 'src/app/main.ts',
          fromLayer: 'app',
          toFile: 'src/infrastructure/database.ts',
          toLayer: 'infrastructure',
        },
      ],
    });

    expect(plain(rendered).split('\n')).toEqual([
      'Layer violations',
      '',
      'app → infrastructure',
      '  ✕ src/app/main.ts → src/infrastructure/database.ts',
      '  ✕ src/app/user.ts → src/infrastructure/cache.ts',
      '',
      'unassigned files',
      '  ✕ src/shared/log.ts',
      '',
      '3 violations',
    ]);
  });
});
