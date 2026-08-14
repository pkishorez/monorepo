import { fileURLToPath } from 'node:url';

import { Effect, Stream } from 'effect';
import { describe, expect, test } from 'vitest';

import { getStoryTree, runStories } from '../index.js';
import { StoriesError } from '../errors.js';

function fixture(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/stories/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

describe('getStoryTree', () => {
  test('loads the Story tree without running any story', async () => {
    const tree = await getStoryTree(fixture('basic')).pipe(Effect.runPromise);

    expect(tree.title).toBe('basic');
    expect(tree.stories).toEqual([]);
    expect(tree.docs.map((doc) => doc.id)).toEqual(['basic/about verdicts']);
    expect(tree.docs[0]!.markdown).toContain('verdicts');
    expect(tree.groups.map((group) => group.title)).toEqual(['verdicts']);
    expect(tree.groups[0]!.docs).toEqual([]);
    expect(tree.groups[0]!.stories.map((story) => story.id)).toEqual([
      'basic/verdicts/passing story',
      'basic/verdicts/failing story',
      'basic/verdicts/erroring story',
    ]);
    expect(tree.groups[0]!.stories[0]!.markdown).toContain('trace');
  });

  test('embeds the declared source file on the Story leaf', async () => {
    const tree = await getStoryTree(fixture('basic')).pipe(Effect.runPromise);

    const [passing, failing] = tree.groups[0]!.stories;
    expect(passing!.source?.path).toBe('stories/index.ts');
    expect(passing!.source?.content).toContain('the answer is 42');
    expect(failing!.source).toBeUndefined();
  });
});

describe('runStories', () => {
  test('runs the Story tree depth-first and reports each verdict', async () => {
    const reports = await runStories(fixture('basic')).pipe(
      Stream.runCollect,
      Effect.runPromise,
    );

    expect(reports.map((report) => report.id)).toEqual([
      'basic/verdicts/passing story',
      'basic/verdicts/failing story',
      'basic/verdicts/erroring story',
    ]);
    expect(reports.map((report) => report.verdict)).toEqual([
      'passed',
      'failed',
      'errored',
    ]);

    const passing = reports[0]!;
    expect(passing.sections).toHaveLength(1);
    const traceSection = passing.sections[0]!;
    expect(traceSection.kind).toBe('trace');
    expect(traceSection.description).toBe('compute the answer');
    expect(
      traceSection.kind === 'trace' &&
        traceSection.trace.spans.map((span) => span.name),
    ).toEqual(['compute-answer']);
    expect(traceSection.assertions).toEqual([
      { description: 'the answer is 42', passed: true },
    ]);

    const failing = reports[1]!;
    expect(failing.sections).toHaveLength(1);
    expect(failing.sections[0]!.kind).toBe('exec');
    expect(failing.sections[0]!.assertions.map(({ passed }) => passed)).toEqual(
      [true, false],
    );

    const erroring = reports[2]!;
    expect(erroring.sections).toHaveLength(1);
    expect(erroring.sections[0]!.kind).toBe('exec');
    expect(erroring.sections[0]!.description).toBe('checks');
    expect(erroring.error).toContain('boom');
  });

  test('runs only the scoped subtree', async () => {
    const reports = await runStories(fixture('basic'), {
      scope: 'basic/verdicts/passing story',
    }).pipe(Stream.runCollect, Effect.runPromise);

    expect(reports.map((report) => report.id)).toEqual([
      'basic/verdicts/passing story',
    ]);
  });

  test('fails on a scope matching no story', async () => {
    const error = await runStories(fixture('basic'), {
      scope: 'basic/nope',
    }).pipe(Stream.runCollect, Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(StoriesError);
    expect((error as StoriesError).reason).toBe('unknown-scope');
  });

  test('fails without a configured Stories path', async () => {
    const error = await runStories(
      fixture('basic').replace('stories/basic', 'modules/valid'),
    ).pipe(Stream.runCollect, Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(StoriesError);
    expect((error as StoriesError).reason).toBe('no-stories-path');
  });
});
