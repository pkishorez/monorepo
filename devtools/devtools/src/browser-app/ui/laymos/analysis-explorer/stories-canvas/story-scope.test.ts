import { describe, expect, it } from 'vitest';
import type {
  ProofLeaf,
  ProofReport,
  ProofVerdict,
  StoryNode,
} from 'laymos/story/schema';

import {
  closeAt,
  openPath,
  ownProofCounts,
  rollupOf,
  tallyOf,
} from './story-scope';

const proof = (id: string, critical = false): ProofLeaf => ({
  id,
  name: id.split('/').at(-1)!,
  title: id,
  description: null,
  venue: 'process',
  critical,
  source: { path: `${id}.proof.ts`, content: '' },
});

const story = (
  id: string,
  proofs: readonly ProofLeaf[],
  stories: readonly StoryNode[] = [],
): StoryNode => ({
  id,
  name: id.split('/').at(-1)!,
  path: id,
  title: id,
  pitch: '',
  body: '',
  stories,
  proofs,
  issues: [],
});

const tree = story(
  'top',
  [proof('top/own')],
  [story('top/part', [proof('top/part/a'), proof('top/part/critical', true)])],
);

const reportsOf = (
  verdicts: Readonly<Record<string, ProofVerdict>>,
): Record<string, ProofReport> =>
  Object.fromEntries(
    Object.entries(verdicts).map(([id, verdict]) => [
      id,
      { verdict } as ProofReport,
    ]),
  );

const rollup = (
  verdicts: Readonly<Record<string, ProofVerdict>>,
  running: readonly string[] = [],
) => rollupOf(tallyOf(tree, reportsOf(verdicts), new Set(running)));

const allPassed = {
  'top/own': 'passed',
  'top/part/a': 'passed',
  'top/part/critical': 'passed',
} as const;

describe('rollupOf', () => {
  it('is grey while nothing has run', () => {
    expect(rollup({})).toBe('not-run');
  });

  it('is grey for a Story with no Proofs beneath', () => {
    expect(rollupOf(tallyOf(story('empty', []), {}, new Set()))).toBe(
      'not-run',
    );
  });

  it('is green only when every Proof beneath passed', () => {
    expect(rollup(allPassed)).toBe('passed');
    expect(rollup({ 'top/own': 'passed', 'top/part/a': 'passed' })).toBe(
      'not-run',
    );
  });

  it('is red when any Proof beneath failed, errored or was unprepared', () => {
    for (const verdict of ['failed', 'errored', 'unprepared'] as const) {
      expect(rollup({ ...allPassed, 'top/part/a': verdict })).toBe('failing');
    }
  });

  it('rings red when a Critical Proof beneath failed', () => {
    expect(rollup({ ...allPassed, 'top/part/critical': 'failed' })).toBe(
      'critical',
    );
    expect(
      rollup({
        ...allPassed,
        'top/own': 'failed',
        'top/part/critical': 'errored',
      }),
    ).toBe('critical');
  });

  it('pulses while any Proof beneath runs, whatever came before', () => {
    expect(
      rollup({ ...allPassed, 'top/part/critical': 'failed' }, ['top/own']),
    ).toBe('running');
  });
});

describe('ownProofCounts', () => {
  it('counts only the Story’s own Proofs', () => {
    expect(ownProofCounts(tree, reportsOf(allPassed), new Set())).toEqual({
      total: 1,
      passed: 1,
      failing: 0,
    });
  });

  it('counts failed, errored and unprepared as failing, and leaves out the rest', () => {
    const part = tree.stories[0]!;
    const reports = reportsOf({
      'top/part/a': 'unprepared',
      'top/part/critical': 'passed',
    });
    expect(ownProofCounts(part, reports, new Set())).toEqual({
      total: 2,
      passed: 1,
      failing: 1,
    });
    expect(
      ownProofCounts(part, reports, new Set(['top/part/critical'])),
    ).toEqual({ total: 2, passed: 0, failing: 1 });
  });
});

describe('openPath and closeAt', () => {
  const tree = story(
    'top',
    [],
    [
      story(
        'top/a',
        [],
        [story('top/a/deep', [], [story('top/a/deep/end', [])])],
      ),
      story('top/b', [], [story('top/b/under', [])]),
    ],
  );

  it('opening a sibling closes the other sibling and what is under it', () => {
    expect([...openPath(tree, 'top/b')]).toEqual(['top', 'top/b']);
  });

  it('opening a deep card keeps its ancestors open, and nothing else', () => {
    expect([...openPath(tree, 'top/a/deep')]).toEqual([
      'top',
      'top/a',
      'top/a/deep',
    ]);
  });

  it('collapsing a middle card closes it and its descendants', () => {
    expect([...closeAt(tree, 'top/a')]).toEqual(['top']);
    expect([...closeAt(tree, 'top')]).toEqual([]);
  });
});
