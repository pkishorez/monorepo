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
              shared: false,
              exposed: false,
              shape: 'directory',
              observedKind: 'isolated',
            },
          ],
          graphs: [],
          violations: [],
        }),
      ),
    ).toBe(
      'Modules: 1 (0 Shared, 0 exposed, 0 in a Module Graph)\nModule Graphs: 0\nShared by Layer: none\n✓ No Module violations',
    );
  });

  test('groups every Module violation kind', () => {
    const rendered = renderModuleReport({
      modules: [
        {
          path: 'src/shared',
          layer: 'domain',
          shared: true,
          exposed: false,
          shape: 'directory',
          observedKind: 'isolated',
        },
      ],
      graphs: [
        {
          id: 'feature',
          layer: 'domain',
          path: 'src/feature',
          members: ['src/feature/core', 'src/feature/index.ts'],
          rules: { 'index.ts': ['core'] },
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
        { kind: 'graph-coverage', graph: 'feature', file: 'src/feature/x.ts' },
        { kind: 'dead-module', module: 'src/feature/core' },
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
    expect(plain(rendered)).toContain(
      'files below a Module Graph with no member\n  ✕ feature: src/feature/x.ts',
    );
    expect(plain(rendered)).toContain(
      'Modules nothing may import\n  ✕ src/feature/core',
    );
    expect(plain(rendered)).toContain('8 violations');
  });
});
