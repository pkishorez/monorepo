import { stripVTControlCharacters } from 'node:util';

import { describe, expect, test } from 'vitest';

import type {
  ProofLeaf,
  ProofReport,
  ProofVerdict,
  StoryNode,
} from '../../../story/schema/index.js';
import { renderStoryRun, renderSummary } from '../report.js';

function leaf(id: string, critical = false): ProofLeaf {
  const name = id.slice(id.lastIndexOf('/') + 1);
  return {
    id,
    name,
    title: `Proof ${name}`,
    description: null,
    venue: 'process',
    critical,
    source: { path: `stories/${name}.proof.ts`, content: '' },
  };
}

function report(
  id: string,
  verdict: ProofVerdict,
  failing: string[] = [],
): ProofReport {
  return {
    id,
    verdict,
    startedAt: 0,
    duration: 12,
    phases: [
      {
        phase: 'verify',
        status: failing.length === 0 ? 'passed' : 'failed',
        startedAt: 0,
        endedAt: 12,
        assertions: failing.map((description) => ({
          description,
          passed: false,
        })),
      },
    ],
    trace: null,
    steps: [],
    recordings: [],
  };
}

const tree: StoryNode = {
  id: 'std',
  name: 'std',
  path: '',
  title: 'Std',
  pitch: 'Keep your data.',
  body: '',
  proofs: [leaf('std/schema')],
  issues: [],
  stories: [
    {
      id: 'std/sync',
      name: 'sync',
      path: 'sync',
      title: 'Sync',
      pitch: '',
      body: '',
      stories: [],
      proofs: [leaf('std/sync/two-tabs', true), leaf('std/sync/offline')],
      issues: [
        {
          kind: 'incomplete-telling',
          target: null,
          message: 'The Telling needs a pitch paragraph.',
        },
      ],
    },
  ],
};

describe('renderStoryRun', () => {
  test('prints the Story tree by title with a mark per verdict and every Telling issue', () => {
    const rendered = stripVTControlCharacters(
      renderStoryRun(tree, [
        report('std/sync/two-tabs', 'passed'),
        report('std/sync/offline', 'unprepared'),
        report('std/schema', 'failed', ['the field was added']),
      ]),
    );

    expect(rendered).toBe(
      [
        'Std std',
        '  ✗ Proof schema 12ms std/schema',
        '      ✗ verify: the field was added',
        '  Sync std/sync',
        '    ⚠ The Telling needs a pitch paragraph.',
        '    ✓ Proof two-tabs critical 12ms std/sync/two-tabs',
        '    ○ Proof offline 12ms std/sync/offline',
      ].join('\n'),
    );
  });

  test('puts Critical Proofs that did not pass first', () => {
    const rendered = stripVTControlCharacters(
      renderStoryRun(tree, [
        report('std/sync/two-tabs', 'errored'),
        report('std/sync/offline', 'passed'),
        report('std/schema', 'passed'),
      ]),
    );

    expect(rendered.split('\n').slice(0, 2)).toEqual([
      'Critical Proofs that did not pass',
      '  ! Proof two-tabs critical 12ms std/sync/two-tabs',
    ]);
  });
});

describe('renderSummary', () => {
  test('counts each verdict and the Telling issues', () => {
    expect(
      stripVTControlCharacters(
        renderSummary([report('a', 'passed'), report('b', 'unprepared')], 2),
      ),
    ).toBe('✗ 2/2 Proofs · 1 passed · 1 unprepared');
    expect(
      stripVTControlCharacters(renderSummary([report('a', 'passed')], 1, 2)),
    ).toBe('✓ 1/1 Proof · 1 passed · 2 Telling issues');
  });
});
