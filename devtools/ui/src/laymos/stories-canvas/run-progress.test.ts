import { describe, expect, it } from 'vitest';
import type { ProofLeaf, StoryNode } from 'laymos/story/schema';

import type { ProofReport } from 'laymos/story/schema';

import {
  finishedOf,
  isUnderway,
  observeRun,
  progressOf,
  runDisplay,
  runningNow,
  settleRun,
  startRun,
  type Run,
} from './run-progress';
import {
  proofsBeneath,
  proofState,
  rollupOf,
  tallyOf,
  type ProofReports,
} from './story-scope';

const proof = (id: string): ProofLeaf => ({
  id,
  name: id.split('/').at(-1)!,
  title: id,
  description: null,
  venue: 'process',
  critical: false,
  source: { path: `${id}.proof.ts`, content: '' },
});

const story = (
  id: string,
  stories: readonly StoryNode[] = [],
  proofs: readonly string[] = [],
): StoryNode => ({
  id,
  name: id.split('/').at(-1)!,
  path: id,
  title: id,
  pitch: '',
  body: '',
  stories,
  proofs: proofs.map((name) => proof(`${id}/${name}`)),
  issues: [],
});

const a = story('top/a', [], ['p1', 'p2', 'p3', 'p4']);
const b = story('top/b', [], ['p1', 'p2']);
const top = story('top', [a, b], ['e2e']);
const ids = (node: StoryNode) => proofsBeneath(node).map((leaf) => leaf.id);
const none: ProofReports = {};

/** Plays running sets through a run and reads the progress after each. */
function play(
  run: Run,
  frames: readonly (readonly string[])[],
  node: StoryNode,
) {
  let current: Run | undefined = run;
  return frames.map((frame) => {
    const running = new Set(frame);
    current = observeRun(current, running, none);
    return progressOf(
      proofsBeneath(node),
      current!.scope,
      finishedOf(current, running, none),
    );
  });
}

describe('run progress', () => {
  it('fixes the total when the run begins, before anything starts', () => {
    const run = startRun(undefined, ids(top), none);
    expect(play(run, [[]], top)).toEqual([{ done: 0, total: 7 }]);
  });

  it('keeps the total constant while Proofs start and finish', () => {
    const run = startRun(undefined, ids(top), none);
    const [e2e, a1, a2, a3, a4, b1, b2] = ids(top);
    const frames = [
      [e2e!],
      [a1!],
      [a1!, a2!],
      [a3!, a4!, b1!],
      [b1!, b2!],
      [b2!],
      [],
    ];
    const progress = play(run, frames, top);
    expect(progress.map((step) => step.total)).toEqual(frames.map(() => 7));
    expect(progress.map((step) => step.done)).toEqual([0, 1, 1, 3, 5, 6, 7]);
  });

  it('counts every level from the same run', () => {
    const run = observeRun(
      startRun(undefined, ids(top), none),
      new Set(ids(top)),
      none,
    );
    const running = new Set(['top/a/p4', ...ids(b)]);
    const finished = finishedOf(run, running, none);
    expect(progressOf(proofsBeneath(top), run!.scope, finished)).toEqual({
      done: 4,
      total: 7,
    });
    expect(progressOf(proofsBeneath(a), run!.scope, finished)).toEqual({
      done: 3,
      total: 4,
    });
    expect(progressOf(top.proofs, run!.scope, finished)).toEqual({
      done: 1,
      total: 1,
    });
  });

  it('counts only the Proofs in the run', () => {
    const run = startRun(undefined, ids(a), none);
    expect(play(run, [[]], top)).toEqual([{ done: 0, total: 4 }]);
    expect(play(run, [[]], b)).toEqual([{ done: 0, total: 0 }]);
  });

  it('ends once everything started has finished, and the next run starts afresh', () => {
    let run = observeRun(
      startRun(undefined, ids(b), none),
      new Set(ids(b)),
      none,
    );
    expect(run?.active).toBe(true);
    run = observeRun(run, new Set(), none);
    expect(run?.active).toBe(false);
    expect(startRun(run, ids(a), none).scope).toEqual(new Set(ids(a)));
  });

  it('joins Proofs run while a run is under way', () => {
    const run = startRun(startRun(undefined, ids(a), none), ids(b), none);
    expect(run.scope).toEqual(new Set([...ids(a), ...ids(b)]));
  });
});

describe('isUnderway', () => {
  it('holds while any Proof is running or waiting in the run', () => {
    const waiting = startRun(undefined, ids(a), none);
    expect(isUnderway(proofsBeneath(a), waiting, new Set(), none)).toBe(true);
    expect(isUnderway(proofsBeneath(b), waiting, new Set(), none)).toBe(false);
    expect(
      isUnderway(proofsBeneath(top), undefined, new Set(['top/b/p1']), none),
    ).toBe(true);
    const ended = observeRun(
      observeRun(waiting, new Set(ids(a)), none),
      new Set(),
      none,
    );
    expect(isUnderway(proofsBeneath(a), ended, new Set(), none)).toBe(false);
  });
});

describe('runningNow', () => {
  it('names the Proof that started last, and counts the others', () => {
    let run = observeRun(
      startRun(undefined, ids(a), none),
      new Set(['top/a/p1']),
      none,
    );
    const running = new Set(['top/a/p1', 'top/a/p3', 'top/a/p2']);
    run = observeRun(run, running, none);
    const now = runningNow(proofsBeneath(top), run, running);
    expect(now?.proof.id).toBe('top/a/p2');
    expect(now?.others).toBe(2);
    expect(runningNow(proofsBeneath(b), run, running)).toBeUndefined();
  });
});

const report = (id: string, verdict: ProofReport['verdict']): ProofReport =>
  ({ id, verdict }) as ProofReport;

/** Every Proof beneath `top` passed in an earlier run. */
const earlier: ProofReports = Object.fromEntries(
  ids(top).map((id) => [id, report(id, 'passed')]),
);

describe('runDisplay', () => {
  const display = (
    run: Run | undefined,
    running: readonly string[],
    reports: ProofReports,
  ) => {
    const set = new Set(running);
    const shown = runDisplay(run, set, reports);
    return {
      state: (id: string) => proofState(id, shown.reports, set, shown.pending),
      rollup: (node: StoryNode) =>
        rollupOf(tallyOf(node, shown.reports, set, shown.pending)),
      shown,
    };
  };

  it('makes every Proof in scope pending the moment the run starts', () => {
    const run = startRun(undefined, ids(top), earlier);
    const { state, rollup } = display(run, [], earlier);
    for (const id of ids(top)) expect(state(id)).toBe('pending');
    expect(rollup(top)).toBe('pending');
    expect(rollup(a)).toBe('pending');
  });

  it('shows pending, running and new verdicts mid-run, never an earlier one', () => {
    const [, a1, a2, a3] = ids(top);
    let run = startRun(undefined, ids(a), earlier);
    run = observeRun(run, new Set([a1!]), earlier)!;
    const reports = { ...earlier, [a1!]: report(a1!, 'failed') };
    run = observeRun(run, new Set([a2!]), reports)!;
    const { state, rollup } = display(run, [a2!], reports);
    expect(state(a1!)).toBe('failed');
    expect(state(a2!)).toBe('running');
    expect(state(a3!)).toBe('pending');
    expect(rollup(a)).toBe('running');
  });

  it('counts a Proof whose report arrived unseen as finished', () => {
    const [, a1] = ids(top);
    const run = startRun(undefined, ids(a), earlier);
    const reports = { ...earlier, [a1!]: report(a1!, 'failed') };
    expect(display(run, [], reports).state(a1!)).toBe('failed');
  });

  it('shows every new verdict once the run ends', () => {
    let run: Run | undefined = startRun(undefined, ids(b), earlier);
    const reports = Object.fromEntries(
      ids(top).map((id) => [
        id,
        ids(b).includes(id) ? report(id, 'failed') : earlier[id]!,
      ]),
    );
    run = observeRun(run, new Set(), reports);
    expect(run?.active).toBe(false);
    const { state, rollup, shown } = display(run, [], reports);
    expect(shown.pending.size).toBe(0);
    for (const id of ids(b)) expect(state(id)).toBe('failed');
    expect(rollup(b)).toBe('failing');
  });

  it('leaves Proofs outside the run with their earlier verdict', () => {
    const run = startRun(undefined, ['top/a/p1'], earlier);
    const { state, rollup } = display(run, [], earlier);
    expect(state('top/a/p1')).toBe('pending');
    for (const id of ['top/a/p2', ...ids(b), 'top/e2e'])
      expect(state(id)).toBe('passed');
    expect(rollup(b)).toBe('passed');
  });

  it('brings back earlier verdicts for Proofs an interrupted run never finished', () => {
    const [, a1, a2] = ids(top);
    let run: Run | undefined = startRun(undefined, ids(a), earlier);
    run = observeRun(run, new Set([a1!]), earlier);
    const reports = { ...earlier, [a1!]: report(a1!, 'failed') };
    run = observeRun(run, new Set([a2!]), reports);
    // The run stops: its last Proof settles without a report, and it ends.
    run = observeRun(run, new Set(), reports);
    expect(run?.active).toBe(true);
    run = settleRun(run, new Set(), reports);
    expect(run?.active).toBe(false);
    const { state, shown } = display(run, [], reports);
    expect(shown.pending.size).toBe(0);
    expect(state(a1!)).toBe('failed');
    expect(state(a2!)).toBe('passed');
    expect(state('top/a/p4')).toBe('passed');
  });

  it('ends a run that gives no end signal once nothing of it runs', () => {
    let run: Run | undefined = startRun(undefined, ids(a), earlier, false);
    run = observeRun(run, new Set(['top/a/p1']), earlier);
    run = observeRun(run, new Set(), earlier);
    expect(run?.active).toBe(false);
  });
});
