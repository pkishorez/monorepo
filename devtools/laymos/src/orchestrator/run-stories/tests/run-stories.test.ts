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
    expect(tree.groups.map((group) => group.title)).toEqual(['verdicts']);
    expect(tree.groups[0]!.stories.map((story) => story.id)).toEqual([
      'basic/verdicts/passing story',
      'basic/verdicts/failing story',
      'basic/verdicts/erroring story',
    ]);
  });

  test('extracts questions, slugs, and literal proof snippets', async () => {
    const tree = await getStoryTree(fixture('basic')).pipe(Effect.runPromise);

    const passing = tree.groups[0]!.stories[0]!;
    expect(passing.questions.map(({ slug }) => slug)).toEqual([
      'what-is-the-answer',
      'what-does-doubling-produce',
    ]);
    expect(passing.questions[0]!.answer).toBe('It is 42.');
    expect(passing.questions[0]!.snippet).toContain('Story.trace(');
    expect(passing.questions[0]!.snippet).toContain('the answer is 42');
    expect(passing.questions[1]!.snippet).toContain('doubled');
    expect(passing.questions[1]!.snippet).not.toContain('Story.trace(');
  });

  test('extracts the shared setup and the source file', async () => {
    const tree = await getStoryTree(fixture('basic')).pipe(Effect.runPromise);

    const passing = tree.groups[0]!.stories[0]!;
    expect(passing.setup).toBe('const answer = 42;');
    expect(passing.source.path).toBe('stories/index.ts');
    expect(passing.source.content).toContain('the answer is 42');
  });

  test('resolves the support file every Story in the directory shares', async () => {
    const tree = await getStoryTree(fixture('basic')).pipe(Effect.runPromise);

    for (const story of tree.groups[0]!.stories) {
      expect(story.support?.path).toBe('stories/support.ts');
      expect(story.support?.content).toContain('export const double');
    }
  });

  test('keeps each story in a shared file on its own proof snippets', async () => {
    const tree = await getStoryTree(fixture('shared-file')).pipe(
      Effect.runPromise,
    );

    const [first, second] = tree.stories;
    expect(first!.questions[0]!.snippet).toContain('first proof ran');
    expect(second!.questions[0]!.snippet).toContain('second proof ran');
  });

  test('leaves support null when the stories tree has no support file', async () => {
    const tree = await getStoryTree(fixture('no-support')).pipe(
      Effect.runPromise,
    );

    expect(tree.stories[0]!.support).toBeNull();
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
  });

  test('captures the proof result, assertions, and trace per question', async () => {
    const reports = await runStories(fixture('basic')).pipe(
      Stream.runCollect,
      Effect.runPromise,
    );

    const [first, second] = reports[0]!.questions;
    expect(first!.slug).toBe('what-is-the-answer');
    expect(first!.verdict).toBe('passed');
    expect(first!.result).toBe(42);
    expect(first!.assertions).toEqual([
      { description: 'the answer is 42', passed: true },
    ]);
    expect(first!.sections).toHaveLength(1);
    expect(
      first!.sections[0]!.kind === 'trace' &&
        first!.sections[0]!.trace.spans.map((span) => span.name),
    ).toEqual(['compute-answer']);

    expect(second!.result).toEqual({ doubled: 84 });
    expect(second!.sections).toEqual([]);
  });

  test('reports a failing assertion without erroring the question', async () => {
    const reports = await runStories(fixture('basic')).pipe(
      Stream.runCollect,
      Effect.runPromise,
    );

    const failing = reports[1]!.questions[0]!;
    expect(failing.verdict).toBe('failed');
    expect(failing.result).toBe(null);
    expect(failing.assertions.map(({ passed }) => passed)).toEqual([
      true,
      false,
    ]);
  });

  test('reports a dying proof as errored with its pretty cause', async () => {
    const reports = await runStories(fixture('basic')).pipe(
      Stream.runCollect,
      Effect.runPromise,
    );

    const erroring = reports[2]!.questions[0]!;
    expect(erroring.verdict).toBe('errored');
    expect(erroring.result).toBeUndefined();
    expect(erroring.error).toContain('boom');
    expect(erroring.assertions).toEqual([
      { description: 'reached before the crash', passed: true },
    ]);
  });

  test('renders a repeated reference in a result instead of marking it circular', async () => {
    const reports = await runStories(fixture('shared-file')).pipe(
      Stream.runCollect,
      Effect.runPromise,
    );

    expect(reports[1]!.questions[0]!.result).toEqual({
      written: { id: 'a' },
      read: { id: 'a' },
    });
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
