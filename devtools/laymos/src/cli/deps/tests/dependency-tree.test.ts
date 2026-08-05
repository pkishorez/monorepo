import { describe, expect, test } from 'vitest';

import { renderDependencyTree } from '../dependency-tree.js';

const ansiEscapeCodes = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

function plainLines(rendered: string): readonly string[] {
  return rendered.replace(ansiEscapeCodes, '').split('\n');
}

describe('renderDependencyTree', () => {
  test('opens with a legend explaining target/direct/transitive coloring', () => {
    const lines = plainLines(renderDependencyTree('src/orchestrator', []));

    expect(lines[0]).toEqual(
      '■ target   ■ direct dependency   ■ transitive dependency',
    );
    expect(lines[1]).toEqual('');
  });

  test('a lone root is printed bare, without a "└── " connector', () => {
    const lines = plainLines(
      renderDependencyTree('src/orchestrator', [
        { path: 'src/domain/file-graph/index.ts', kind: 'direct' },
        { path: 'src/domain/file-graph/file-graph.ts', kind: 'recursive' },
        { path: 'src/services/index.ts', kind: 'direct' },
      ]),
    );

    expect(lines.slice(2)).toEqual([
      'src',
      '├── domain',
      '│   └── file-graph',
      '│       ├── file-graph.ts',
      '│       └── index.ts',
      '├── orchestrator',
      '└── services',
      '    └── index.ts',
    ]);
  });

  test('with no dependencies, the tree is just the target path', () => {
    const lines = plainLines(renderDependencyTree('src/orchestrator', []));

    expect(lines.slice(2)).toEqual(['src', '└── orchestrator']);
  });

  test('a target at the very root has no lone-root special-casing to conflict with', () => {
    const lines = plainLines(renderDependencyTree('src', []));

    expect(lines.slice(2)).toEqual(['src']);
  });

  test('multiple top-level roots get normal connectors, unlike the lone-root case', () => {
    // A dependency outside src/ (e.g. a generated docs file) gives the tree
    // two top-level roots: docs and src. Contrast with the lone-root test
    // above, where everything shares one top-level directory and gets no
    // connector at all.
    const lines = plainLines(
      renderDependencyTree('src/orchestrator', [
        { path: 'docs/api.md', kind: 'direct' },
        { path: 'src/services/index.ts', kind: 'direct' },
      ]),
    );

    expect(lines.slice(2)).toEqual([
      '├── docs',
      '│   └── api.md',
      '└── src',
      '    ├── orchestrator',
      '    └── services',
      '        └── index.ts',
    ]);
  });
});
