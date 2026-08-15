import { describe, expect, test } from 'vitest';

import { renderModuleInspection } from '../report.js';

const ansiEscapeCodes = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

function plain(rendered: string): string {
  return rendered.replace(ansiEscapeCodes, '');
}

describe('renderModuleInspection', () => {
  test('renders Module metadata and one connected dependency tree', () => {
    const rendered = plain(
      renderModuleInspection({
        module: {
          path: 'src/domain/orders',
          layer: 'domain',
          kind: 'normal',
          shape: 'directory',
          observedKind: 'regular',
          subpaths: ['events'],
        },
        publicEntryPoints: [
          'src/domain/orders/index.ts',
          'src/domain/orders/events/index.ts',
        ],
        dependents: ['src/app/checkout'],
        dependencies: ['src/domain/shared'],
        hasViolations: false,
      }),
    );

    expect(rendered).toContain(
      'Module:   src/domain/orders\nLayer:    domain\nKind:     normal\nShape:    directory\nObserved: regular\nSubpaths: 1',
    );
    expect(rendered).toContain('■ active   ■ dependents   ■ dependencies');
    expect(rendered).toContain('├── app\n│   └── checkout');
    expect(rendered).toContain('└── domain\n    ├── orders\n    └── shared');
  });

  test('renders no public entry points and a violation warning', () => {
    const rendered = plain(
      renderModuleInspection({
        module: {
          path: 'src/jobs',
          layer: 'app',
          kind: 'entry',
          shape: 'directory',
          observedKind: 'isolated',
          subpaths: [],
        },
        publicEntryPoints: [],
        dependents: [],
        dependencies: [],
        hasViolations: true,
      }),
    );

    expect(rendered).toContain('Public entry points:\n  none');
    expect(rendered).toContain(
      'Warning: this Module has architecture violations.',
    );
  });
});
