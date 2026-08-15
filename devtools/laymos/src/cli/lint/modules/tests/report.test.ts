import { describe, expect, test } from 'vitest';

import { renderModuleReport } from '../report.js';

const ansiEscapeCodes = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

function plain(rendered: string): string {
  return rendered.replace(ansiEscapeCodes, '');
}

describe('renderModuleReport', () => {
  test('renders a clean result', () => {
    expect(
      plain(
        renderModuleReport({
          modules: [
            {
              path: 'src/app',
              layer: 'app',
              kind: 'entry',
              shape: 'directory',
              observedKind: 'isolated',
              subpaths: [],
            },
          ],
          violations: [],
        }),
      ),
    ).toBe(
      'Modules: 1 (0 Normal, 0 Shared, 1 Entry)\nShared by Layer: none\n✓ No Module violations',
    );
  });

  test('groups every Module violation kind', () => {
    const rendered = renderModuleReport({
      modules: [
        {
          path: 'src/shared',
          layer: 'domain',
          kind: 'shared',
          shape: 'directory',
          observedKind: 'isolated',
          subpaths: [],
        },
      ],
      violations: [
        { kind: 'coverage', file: 'src/loose.ts' },
        {
          kind: 'missing-entry-point',
          module: 'src/a',
          path: 'src/a/index.ts',
        },
        {
          kind: 'dependency',
          fromFile: 'src/a/index.ts',
          fromModule: 'src/a',
          toFile: 'src/b/index.ts',
          toModule: 'src/b',
        },
        {
          kind: 'boundary',
          fromFile: 'src/a/index.ts',
          fromModule: 'src/a',
          toFile: 'src/shared/internal.ts',
          toModule: 'src/shared',
        },
        { kind: 'cycle', modules: ['src/a', 'src/b'] },
        { kind: 'unused-shared', module: 'src/shared' },
      ],
    });

    expect(plain(rendered)).toContain('unassigned files\n  ✕ src/loose.ts');
    expect(plain(rendered)).toContain('missing Module entry points');
    expect(plain(rendered)).toContain(
      'Missing Module entry point: src/a/index.ts',
    );
    expect(plain(rendered)).toContain('forbidden Module dependencies');
    expect(plain(rendered)).toContain('internal Module imports');
    expect(plain(rendered)).toContain(
      'Module cycles\n  ✕ src/a → src/b → src/a',
    );
    expect(plain(rendered)).toContain('unused Shared Modules\n  ✕ src/shared');
    expect(plain(rendered)).toContain('6 violations');
  });
});
