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
          shared: false,
          exposed: true,
          shape: 'directory',
          observedKind: 'regular',
          graph: 'orders',
          member: 'orders',
        },
        graphRules: ['shared'],
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
      'Module:   src/domain/orders\nLayer:    domain\nGraph:    orders\nShared:   false\nExposed:  true\nShape:    directory\nObserved: regular\nMay import: shared',
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
          shared: false,
          exposed: false,
          shape: 'directory',
          observedKind: 'isolated',
        },
        graphRules: undefined,
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
