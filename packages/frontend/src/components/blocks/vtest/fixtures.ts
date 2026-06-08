import type {
  VtestConfig,
  VtestFeature,
  VtestPackage,
  VtestSection,
} from './types';

/** Static demo packages for the home screen. */
export const packages: VtestPackage[] = [
  {
    id: 'core',
    name: '@monorepo/core',
    path: 'packages/core',
    featureCount: 8,
  },
  {
    id: 'vtest',
    name: '@monorepo/vtest',
    path: 'packages/vtest',
    featureCount: 5,
  },
  {
    id: 'frontend',
    name: '@monorepo/frontend',
    path: 'packages/frontend',
    featureCount: 12,
  },
  {
    id: 'finances',
    name: '@monorepo/finances',
    path: 'packages/finances',
    featureCount: 4,
  },
  {
    id: 'auth',
    name: '@monorepo/auth',
    path: 'packages/auth',
    featureCount: 6,
  },
  {
    id: 'kishore-app',
    name: '@monorepo/kishore-app',
    path: 'packages/kishore-app',
    featureCount: 9,
  },
  {
    id: 'otel',
    name: '@monorepo/otel',
    path: 'packages/otel',
    featureCount: 3,
  },
];

export const discovery: string[] = [
  'packages/realtime',
  'packages/billing',
  'packages/notifications',
];

/** Folders grouped by toc section for a package page. */
export const sections: VtestSection[] = [
  {
    title: 'Getting started',
    folders: [
      {
        name: 'installation',
        summary: 'Install and configure vtest.',
        health: 'pass',
      },
      {
        name: 'first-feature',
        summary: 'Author your first documented feature.',
        health: 'pass',
      },
    ],
  },
  {
    title: 'Authoring',
    folders: [
      {
        name: 'directives',
        summary: 'Embed test groups with ::test-group.',
        health: 'fail',
      },
      {
        name: 'vdocs',
        summary: 'Per-test documentation strings.',
        health: 'pending',
      },
      {
        name: 'toc',
        summary: 'Group features into named sections.',
        health: 'pass',
      },
      {
        name: 'diagnostics',
        summary: 'Static validation of the doc contract.',
        health: 'unknown',
      },
      {
        name: 'overview',
        summary: 'Package overview from home.md.',
        health: 'pass',
      },
      { name: 'sections', summary: 'Reading-order grouping.', health: 'pass' },
    ],
  },
];

export const overview = `# @monorepo/vtest

A live, package-agnostic test documentation server. Drill into a package to
read its features one topic at a time, with embedded test groups.

This package has **5 features** across two sections.`;

const featureMarkdown = `Directives let you embed a test group exactly where it belongs in the
documentation, so the reader sees prose and the tests it describes together.

## Declaring a directive

Write \`::test-group{id=basic}\` on its own line. vtest replaces it with the
group's live status when rendered.

\`\`\`ts
const out = render('::test-group{id=basic}');
expect(out).toContain('basic');
\`\`\`

::test-group{id=basic}

The id must match a folder under \`tests/\`.

## Multiple groups

A single feature can reference several groups, each in its own topic.

::test-group{id=edge-cases}

Groups render in document order.

## Validation

Missing or duplicate ids surface as diagnostics on this page.`;

function offsetOf(marker: string): number {
  return featureMarkdown.indexOf(marker);
}

/** A full feature payload matching the RPC GetFeature response shape. */
export const feature: VtestFeature = {
  name: 'directives',
  markdown: featureMarkdown,
  directives: [
    { id: 'basic', offset: offsetOf('::test-group{id=basic}') },
    { id: 'edge-cases', offset: offsetOf('::test-group{id=edge-cases}') },
  ],
  groups: [
    {
      id: 'basic',
      tests: [
        {
          name: 'replaces the directive with the group',
          vdoc: 'The marker line is substituted.',
          status: 'pass',
          durationMs: 4,
          file: 'basic.test.ts',
          startLine: 5,
          endLine: 13,
        },
        {
          name: 'matches id to a tests/ folder',
          vdoc: null,
          status: 'pass',
          file: 'basic.test.ts',
          startLine: 15,
          endLine: 18,
        },
        {
          name: 'ignores indented markers',
          vdoc: 'Only column-zero markers count.',
          status: 'skip',
          file: 'basic.test.ts',
          startLine: 20,
          endLine: 24,
        },
      ],
      files: [
        {
          path: 'basic.test.ts',
          source: `import { expect } from 'vitest';
import { vtest } from '@monorepo/vtest';
import { render } from './render';

vtest(
  'replaces the directive with the group',
  'The marker line is substituted.',
  () => {
    const out = render('::test-group{id=basic}');
    expect(out).toContain('basic');
  },
);
`,
        },
      ],
    },
    {
      id: 'edge-cases',
      tests: [
        {
          name: 'handles a feature with no directives',
          vdoc: null,
          status: 'pass',
          durationMs: 2,
          file: 'edge-cases.test.ts',
          startLine: 4,
          endLine: 6,
        },
        {
          name: 'reports a directive with no matching group',
          vdoc: 'Surfaces as an error diagnostic.',
          status: 'fail',
          durationMs: 11,
          error:
            "AssertionError: expected 'orphan' to be reported\n  at edge-cases.test.ts:8:14",
          file: 'edge-cases.test.ts',
          startLine: 8,
          endLine: 14,
        },
      ],
      files: [
        {
          path: 'edge-cases.test.ts',
          source: `import { expect, test } from 'vitest';
import { render } from './render';

test('handles a feature with no directives', () => {
  expect(render('# Title')).toBe('# Title');
});
`,
        },
      ],
    },
  ],
  diagnostics: [
    {
      level: 'error',
      feature: 'directives',
      groupId: 'orphan',
      message: 'No test group folder for directive id "orphan".',
    },
    {
      level: 'warning',
      feature: 'directives',
      message: 'Group "edge-cases" has no vdoc on 1 test.',
    },
  ],
};

const installMarkdown = `Add vtest as a dev dependency and point it at a package.

## Install

\`\`\`bash
pnpm add -D @monorepo/vtest
\`\`\`

That's all the setup a package needs.`;

/** A full reader payload for the `<VtestView>` preview. */
export const config: VtestConfig = {
  package: { name: '@monorepo/vtest', dir: '/repo/packages/vtest' },
  toc: {
    sections: [
      { title: 'Getting started', features: ['installation'] },
      { title: 'Authoring', features: ['directives'] },
    ],
  },
  features: [
    {
      name: 'installation',
      markdown: installMarkdown,
      directives: [],
      diagnostics: [],
      groups: [],
    },
    {
      name: feature.name,
      markdown: feature.markdown,
      directives: feature.directives,
      diagnostics: feature.diagnostics,
      groups: feature.groups,
    },
  ],
};
