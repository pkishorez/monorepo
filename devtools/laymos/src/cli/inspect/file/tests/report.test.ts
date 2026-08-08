import { describe, expect, test } from 'vitest';

import { renderFileInspection } from '../report.js';

const ansiEscapeCodes = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

function plain(rendered: string): string {
  return rendered.replace(ansiEscapeCodes, '');
}

describe('renderFileInspection', () => {
  test('renders metadata before a path-grouped dependency tree', () => {
    const rendered = plain(
      renderFileInspection({
        path: 'src/domain/orders/create-order.ts',
        layer: 'domain',
        module: 'src/domain/orders',
        role: 'internal',
        dependencies: [
          { path: 'src/domain/shared/id.ts', kind: 'direct' },
          { path: 'src/infra/database.ts', kind: 'recursive' },
        ],
        recursive: true,
        hasCoverageViolation: false,
      }),
    );

    expect(rendered).toContain(
      'File:   src/domain/orders/create-order.ts\nLayer:  domain\nModule: src/domain/orders\nRole:   internal',
    );
    expect(rendered).toContain(
      '■ active   ■ direct dependency   ■ transitive dependency',
    );
    expect(rendered).toContain('├── domain\n│   ├── orders');
    expect(rendered).toContain('└── infra\n    └── database.ts');
  });

  test('renders unassigned membership and its warning', () => {
    const rendered = plain(
      renderFileInspection({
        path: 'src/orphan.ts',
        layer: undefined,
        module: undefined,
        role: undefined,
        dependencies: [],
        recursive: false,
        hasCoverageViolation: true,
      }),
    );

    expect(rendered).toContain('Layer:  unassigned');
    expect(rendered).toContain('Module: unassigned');
    expect(rendered).toContain(
      'Warning: this file has architecture coverage violations.',
    );
  });
});
