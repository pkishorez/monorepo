import { describe, expect, test } from 'vitest';
import type { StoryTree } from 'laymos';

import { groupChange, storyChange, type ChangedPaths } from './model';

type StoryLeaf = StoryTree['stories'][number];

function story(id: string, path: string, supportPath?: string): StoryLeaf {
  return {
    id,
    title: id,
    description: '',
    spine: false,
    page: null,
    setup: null,
    questions: [],
    source: { path, content: '' },
    support:
      supportPath === undefined ? null : { path: supportPath, content: '' },
  };
}

function group(title: string, stories: readonly StoryLeaf[]): StoryTree {
  return { title, description: '', page: null, groups: [], stories };
}

function changed(
  ...entries: readonly (readonly [string, 'added' | 'modified'])[]
): ChangedPaths {
  return new Map(entries);
}

describe('storyChange', () => {
  test('marks a Story added when its file is added', () => {
    const actual = storyChange(
      story('a', 'stories/a.ts'),
      changed(['stories/a.ts', 'added']),
    );

    expect(actual).toEqual({ status: 'added' });
  });

  test('marks a Story modified when its file is modified', () => {
    const actual = storyChange(
      story('a', 'stories/a.ts'),
      changed(['stories/a.ts', 'modified']),
    );

    expect(actual).toEqual({ status: 'modified', supportOnly: false });
  });

  test('marks a Story modified when only its support file changed', () => {
    const actual = storyChange(
      story('a', 'stories/a.ts', 'stories/support.ts'),
      changed(['stories/support.ts', 'modified']),
    );

    expect(actual).toEqual({ status: 'modified', supportOnly: true });
  });

  test('prefers the Story own edit over its support edit', () => {
    const actual = storyChange(
      story('a', 'stories/a.ts', 'stories/support.ts'),
      changed(['stories/a.ts', 'modified'], ['stories/support.ts', 'modified']),
    );

    expect(actual).toEqual({ status: 'modified', supportOnly: false });
  });

  test('leaves an untouched Story unmarked', () => {
    expect(storyChange(story('a', 'stories/a.ts'), changed())).toBeUndefined();
  });
});

describe('groupChange', () => {
  test('marks a Group added when every descendant Story is added', () => {
    const actual = groupChange(
      group('g', [story('a', 'stories/a.ts'), story('b', 'stories/b.ts')]),
      changed(['stories/a.ts', 'added'], ['stories/b.ts', 'added']),
    );

    expect(actual).toEqual({ status: 'added' });
  });

  test('marks a Group modified when only some descendants changed', () => {
    const actual = groupChange(
      group('g', [story('a', 'stories/a.ts'), story('b', 'stories/b.ts')]),
      changed(['stories/a.ts', 'added']),
    );

    expect(actual).toEqual({ status: 'modified', supportOnly: false });
  });

  test('leaves an untouched Group unmarked', () => {
    const actual = groupChange(
      group('g', [story('a', 'stories/a.ts')]),
      changed(),
    );

    expect(actual).toBeUndefined();
  });
});
