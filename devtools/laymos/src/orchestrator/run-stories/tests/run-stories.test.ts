import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Effect, Stream } from 'effect';
import { describe, expect, test } from 'vitest';

import type {
  ProofReport,
  ProofRunEvent,
} from '../../../story/schema/index.js';
import {
  findSelfContainedViolations,
  findTellingIssues,
  getStoryTree,
  loadStoryReports,
  runStories,
  StoriesError,
} from '../index.js';

function fixture(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/stories/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

const verdicts = fixture('verdicts');
const tellings = fixture('tellings');

function run(configPath: string, scope?: string) {
  return runStories(configPath, { scope }).pipe(
    Stream.runCollect,
    Effect.runPromise,
  );
}

function finished(events: readonly ProofRunEvent[]): Map<string, ProofReport> {
  return new Map(
    events.flatMap((event) =>
      event._tag === 'Finished' ? [[event.report.id, event.report]] : [],
    ),
  );
}

describe('getStoryTree', () => {
  test('builds the Story tree from folders and Tellings without running any Proof', async () => {
    const tree = await getStoryTree(verdicts).pipe(Effect.runPromise);

    expect(tree).toMatchObject({
      id: 'verdicts',
      name: 'verdicts',
      path: '',
      title: 'Verdicts',
      pitch:
        'Every way a Proof can end, so you can trust what a report tells you.',
      issues: [],
    });
    expect(tree.stories.map(({ id, path }) => [id, path])).toEqual([
      ['verdicts/budget', 'budget'],
      ['verdicts/critical', 'critical'],
    ]);
    expect(tree.stories[1]!.proofs.map(({ id }) => id)).toEqual([
      'verdicts/critical/critical',
    ]);
    expect(tree.proofs.map(({ id }) => id)).toEqual([
      'verdicts/passed',
      'verdicts/errored',
      'verdicts/failed',
      'verdicts/timeout',
      'verdicts/unprepared',
    ]);
  });

  test('describes each Proof by its own file', async () => {
    const tree = await getStoryTree(verdicts).pipe(Effect.runPromise);

    const critical = tree.stories[1]!.proofs[0]!;
    expect(critical).toMatchObject({
      name: 'critical',
      title: 'The answer never changes',
      description: null,
      venue: 'process',
      critical: true,
      source: { path: 'stories/critical/critical.proof.ts' },
    });
    expect(critical.source.content).toContain('the answer is 42');
  });

  test('carries every Telling issue', async () => {
    const tree = await getStoryTree(tellings).pipe(Effect.runPromise);

    expect(tree.issues.map(({ kind, target }) => [kind, target])).toEqual([
      ['broken-link', 'tellings/nowhere'],
      ['unnamed-part', 'tellings/quiet'],
    ]);
    expect(tree.stories.map(({ id, title }) => [id, title])).toEqual([
      ['tellings/told', 'Told'],
      ['tellings/quiet', 'quiet'],
    ]);
  });

  test('fails without a Stories path', async () => {
    const error = await getStoryTree(
      fileURLToPath(
        new URL(
          '../../../tests/fixtures/tree/shop/laymos.config.json',
          import.meta.url,
        ),
      ),
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(StoriesError);
    expect((error as StoriesError).reason).toBe('no-stories-path');
  });
});

describe('runStories', { concurrent: false }, () => {
  test('decides each verdict and streams Started before Finished', async () => {
    const events = await run(verdicts);
    const reports = finished(events);

    expect(
      Object.fromEntries([...reports].map(([id, r]) => [id, r.verdict])),
    ).toEqual({
      'verdicts/budget/budget': 'failed',
      'verdicts/critical/critical': 'passed',
      'verdicts/errored': 'errored',
      'verdicts/failed': 'failed',
      'verdicts/passed': 'passed',
      'verdicts/timeout': 'errored',
      'verdicts/unprepared': 'unprepared',
    });
    for (const id of reports.keys()) {
      const started = events.findIndex(
        (event) => event._tag === 'Started' && event.id === id,
      );
      const ended = events.findIndex(
        (event) => event._tag === 'Finished' && event.report.id === id,
      );
      expect(started).toBeGreaterThanOrEqual(0);
      expect(started).toBeLessThan(ended);
    }
  });

  test('reports each phase with its status, value, and assertions', async () => {
    const reports = finished(await run(verdicts));

    const passed = reports.get('verdicts/passed')!;
    expect(passed.phases.map(({ phase, status }) => [phase, status])).toEqual([
      ['prepare', 'passed'],
      ['act', 'passed'],
      ['verify', 'passed'],
    ]);
    expect(passed.phases[0]!.value).toEqual({ open: true });
    expect(passed.phases[1]!.value).toEqual({ doubled: 42, open: true });
    expect(passed.trace?.spans.map(({ name }) => name)).toEqual([
      'Proof',
      'prepare',
      'act',
      'double',
      'verify',
    ]);

    const unprepared = reports.get('verdicts/unprepared')!;
    expect(unprepared.phases.map(({ status }) => status)).toEqual([
      'failed',
      'skipped',
      'skipped',
    ]);

    const errored = reports.get('verdicts/errored')!;
    expect(errored.phases[1]).toMatchObject({ status: 'errored' });
    expect(errored.phases[1]!.error).toContain('the write was refused');
    expect(errored.phases[2]!.status).toBe('skipped');
  });

  test('a Proof that outlives its timeout errors in the phase it was in', async () => {
    const report = finished(await run(verdicts, 'verdicts/timeout')).get(
      'verdicts/timeout',
    )!;

    expect(report.error).toBe('Proof timed out after 200ms');
    expect(report.phases.map(({ status }) => status)).toEqual([
      'passed',
      'errored',
      'skipped',
    ]);
  });

  test('a budget fails on a slow span and on a missing one', async () => {
    const report = finished(await run(verdicts, 'verdicts/budget')).get(
      'verdicts/budget/budget',
    )!;

    expect(report.phases[2]!.assertions.map(({ passed }) => passed)).toEqual([
      true,
      false,
      false,
    ]);
  });

  test('scopes a run to a Story and everything beneath it, or one Proof', async () => {
    expect([
      ...finished(await run(verdicts, 'verdicts/critical')).keys(),
    ]).toEqual(['verdicts/critical/critical']);
    expect([
      ...finished(await run(verdicts, 'verdicts/failed')).keys(),
    ]).toEqual(['verdicts/failed']);
    expect(finished(await run(verdicts, 'verdicts')).size).toBe(7);
    const error = await runStories(verdicts, {
      scope: 'verdicts/nowhere',
    }).pipe(Stream.runCollect, Effect.flip, Effect.runPromise);
    expect(error).toMatchObject({
      reason: 'unknown-scope',
      path: 'verdicts/nowhere',
    });
  });

  test('writes each report to its Evidence folder and reads it back', async () => {
    await run(verdicts, 'verdicts/critical');
    const folder = join(
      dirname(verdicts),
      '.laymos/stories/verdicts/critical/critical',
    );

    expect(existsSync(join(folder, 'report.json'))).toBe(true);
    const saved = await loadStoryReports(verdicts).pipe(Effect.runPromise);
    expect(
      saved.find(({ id }) => id === 'verdicts/critical/critical')?.verdict,
    ).toBe('passed');
  });
});

describe('findTellingIssues', () => {
  test('reports every Telling issue without importing a Proof', async () => {
    const issues = await findTellingIssues(tellings).pipe(Effect.runPromise);

    expect(issues.map(({ story, issue }) => [story, issue.kind])).toEqual([
      ['tellings', 'broken-link'],
      ['tellings', 'unnamed-part'],
      ['tellings/told', 'incomplete-telling'],
      ['tellings/quiet', 'missing-telling'],
    ]);
    expect(await findTellingIssues(verdicts).pipe(Effect.runPromise)).toEqual(
      [],
    );
  });
});

describe('findSelfContainedViolations', () => {
  test('reports every relative import in a Proof file', async () => {
    const violations = await findSelfContainedViolations(verdicts).pipe(
      Effect.runPromise,
    );

    expect(violations).toContainEqual({
      id: 'verdicts/critical/critical',
      specifier: '../../../../../../story/index.js',
    });
    expect(violations).toHaveLength(7);
  });
});

describe('runStories in the Browser Venue', () => {
  test('records Steps, screenshots, and every frame of each Tab', async () => {
    const browser = fixture('browser');
    const reports = finished(await run(browser));

    const desktop = reports.get('browser/desktop')!;
    expect(desktop.verdict).toBe('passed');
    expect(
      desktop.steps.map(({ name, kind, phase }) => [name, kind, phase]),
    ).toEqual([
      ['Open Tab 1', 'open', 'prepare'],
      ['Write the note', 'type', 'act'],
      ['Add it', 'click', 'act'],
      ['Read to the end', 'scroll', 'act'],
      ['Back to the top', 'scroll', 'act'],
      ['Open search', 'press', 'act'],
      ['Open Second', 'open', 'act'],
      ['Close the second Tab', 'close', 'act'],
      ['Open Third', 'open', 'act'],
    ]);
    const close = desktop.steps.find(({ kind }) => kind === 'close')!;
    expect(close).toMatchObject({ passed: true, screenshot: null });
    expect(desktop.phases[0]!.value).toEqual({
      tab: 'Tab 1',
      device: 'Device 1',
    });
    expect(desktop.phases[1]!.value).toMatchObject({
      third: { tab: 'Third', device: 'Device 1' },
    });
    const second = desktop.recordings.find(({ tab }) => tab === 'Second')!;
    expect(second.closedAt).toBeLessThanOrEqual(close.endedAt);
    const [recording] = desktop.recordings;
    expect(recording).toMatchObject({
      tab: 'Tab 1',
      device: 'Device 1',
      deviceKind: 'desktop',
      viewport: { width: 1280, height: 800 },
    });
    expect(recording!.frames.length).toBeGreaterThan(30);
    const folder = join(dirname(browser), '.laymos/stories/browser/desktop');
    expect(existsSync(join(folder, recording!.frames[0]!.file))).toBe(true);
    expect(existsSync(join(folder, desktop.steps[0]!.screenshot!))).toBe(true);

    const mobile = reports.get('browser/mobile')!;
    expect(mobile.verdict).toBe('passed');
    expect(mobile.recordings[0]!.deviceKind).toBe('mobile');
    const pinch = mobile.steps.find(({ kind }) => kind === 'gesture')!;
    const typing = mobile.steps.find(({ kind }) => kind === 'type')!;
    // Human pace: a Gesture lasts about a second, each key ~100 ms, and the screen rests after each Step.
    expect(pinch.endedAt - pinch.startedAt).toBeGreaterThan(1_500);
    expect(typing.endedAt - typing.startedAt).toBeGreaterThan(
      'Sunset'.length * 100 + 700,
    );
  }, 180_000);
});
