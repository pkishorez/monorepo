import { describe, expect, test } from 'vitest';

import type { ProofLeaf, StoryNode } from '../../schema/index.js';
import {
  buildStoryTree,
  narrowStoryTree,
  parseTelling,
  proofIdOf,
  proofsOf,
  storiesOf,
  storyIdOf,
  type StoryFolder,
} from '../index.js';

function proof(name: string): Omit<ProofLeaf, 'id'> {
  return {
    name,
    title: `Proof ${name}`,
    description: null,
    venue: 'process',
    critical: false,
    source: { path: `stories/${name}.proof.ts`, content: '' },
  };
}

function folder(
  path: string,
  telling: string | null,
  proofs: string[] = [],
): StoryFolder {
  return { path, telling, proofs: proofs.map(proof) };
}

function find(tree: StoryNode, id: string): StoryNode {
  const found = storiesOf(tree).find((story) => story.id === id);
  if (found === undefined) throw new Error(`no Story ${id}`);
  return found;
}

describe('parseTelling', () => {
  test('splits the title, the pitch, and the body', () => {
    expect(
      parseTelling(
        [
          '# Evolving schema',
          '',
          'Change your data whenever you like;',
          'old rows still read.',
          '',
          'Your data outlives its first design.',
          '',
          'Every change becomes a [migration](std/evolving-schema/migrations).',
        ].join('\n'),
      ),
    ).toEqual({
      title: 'Evolving schema',
      pitch: 'Change your data whenever you like; old rows still read.',
      body: [
        'Your data outlives its first design.',
        '',
        'Every change becomes a [migration](std/evolving-schema/migrations).',
      ].join('\n'),
      links: ['std/evolving-schema/migrations'],
    });
  });

  test('keeps only links that name a Story or a Proof, each once, in order', () => {
    const { links } = parseTelling(
      [
        '# Links',
        '',
        'See [b](std/b) and [a](std/a), then [b again](std/b/).',
        '[web](https://example.com) [mail](mailto:me@x.dev) [anchor](#top)',
        '[root](/docs) [relative](./file.md) [up](../x) ![image](std/picture)',
        '`[code](std/in-code)`',
        '',
        '```md',
        '[fenced](std/in-fence)',
        '```',
      ].join('\n'),
    );

    expect(links).toEqual(['std/b', 'std/a']);
  });

  test('has no title or pitch when the Telling lacks them', () => {
    expect(parseTelling('Just a paragraph.\n\nMore.')).toMatchObject({
      title: null,
      pitch: 'Just a paragraph.',
      body: 'More.',
    });
    expect(parseTelling('# Only a title\n\n- a list\n')).toMatchObject({
      title: 'Only a title',
      pitch: '',
      body: '- a list',
    });
  });
});

describe('ids', () => {
  test('start at the Project folder name', () => {
    expect(storyIdOf('std', '')).toBe('std');
    expect(storyIdOf('std', 'sync/tabs')).toBe('std/sync/tabs');
    expect(proofIdOf('std', '', 'end-to-end')).toBe('std/end-to-end');
    expect(proofIdOf('std', 'sync', 'two-tabs')).toBe('std/sync/two-tabs');
  });
});

describe('buildStoryTree', () => {
  const tree = buildStoryTree('std', [
    folder(
      '',
      [
        '# Std',
        '',
        'Keep your data.',
        '',
        'First [sync](std/sync), then [schema](std/schema).',
        'It [survives](std/survives).',
      ].join('\n'),
      ['works', 'survives'],
    ),
    folder('schema', '# Schema\n\nShapes change.\n', ['b', 'a']),
    folder('sync', '# Sync\n\nTabs agree.\n\n[two](std/sync/two-tabs)', [
      'offline',
      'two-tabs',
    ]),
  ]);

  test('gives each Story and Proof its id beneath the top Story', () => {
    expect(tree).toMatchObject({
      id: 'std',
      name: 'std',
      path: '',
      title: 'Std',
      pitch: 'Keep your data.',
    });
    expect(find(tree, 'std/sync')).toMatchObject({
      name: 'sync',
      path: 'sync',
      title: 'Sync',
    });
    expect(proofsOf(tree).map(({ id }) => id)).toContain('std/sync/two-tabs');
  });

  test('orders parts by first link, unlinked ones last by name', () => {
    expect(tree.stories.map(({ id }) => id)).toEqual([
      'std/sync',
      'std/schema',
    ]);
    expect(tree.proofs.map(({ name }) => name)).toEqual(['survives', 'works']);
    expect(find(tree, 'std/schema').proofs.map(({ name }) => name)).toEqual([
      'a',
      'b',
    ]);
    expect(find(tree, 'std/sync').proofs.map(({ name }) => name)).toEqual([
      'two-tabs',
      'offline',
    ]);
  });

  test('a well-told tree has no issues', () => {
    expect(storiesOf(tree).flatMap(({ issues }) => issues)).toEqual([]);
  });

  test('reports a missing Telling and falls back to the folder name', () => {
    const missing = buildStoryTree('std', [
      folder('', '# Std\n\nPitch.\n\n[a](std/a)'),
      folder('a', null),
      folder('a/b', '# B\n\nPitch.'),
    ]);

    expect(find(missing, 'std/a')).toMatchObject({
      title: 'a',
      pitch: '',
      body: '',
      issues: [{ kind: 'missing-telling', target: null }],
    });
  });

  test('reports an incomplete Telling', () => {
    const incomplete = buildStoryTree('std', [folder('', 'No title here.')]);

    expect(incomplete.issues).toEqual([
      {
        kind: 'incomplete-telling',
        target: null,
        message: 'The Telling needs a # title.',
      },
    ]);
    expect(incomplete.title).toBe('std');
    expect(
      buildStoryTree('std', [folder('', '# Title only')]).issues,
    ).toMatchObject([{ kind: 'incomplete-telling' }]);
  });

  test('reports a link to nothing, and accepts links anywhere in the tree', () => {
    const broken = buildStoryTree('std', [
      folder(
        '',
        '# Std\n\nPitch.\n\n[a](std/a) [deep](std/a/b/p) [gone](std/nope)',
      ),
      folder('a', '# A\n\nPitch.\n\n[b](std/a/b) [top](std)'),
      folder('a/b', '# B\n\nPitch.', ['p']),
    ]);

    expect(broken.issues).toEqual([
      {
        kind: 'broken-link',
        target: 'std/nope',
        message: 'No Story or Proof `std/nope`.',
      },
    ]);
    expect(find(broken, 'std/a').issues).toEqual([]);
  });

  test('reports a sub-Story its parent never names', () => {
    const unnamed = buildStoryTree('std', [
      folder('', '# Std\n\nPitch.'),
      folder('quiet', '# Quiet\n\nPitch.'),
    ]);

    expect(unnamed.issues).toEqual([
      {
        kind: 'unnamed-part',
        target: 'std/quiet',
        message: 'The Telling never links its sub-Story `std/quiet`.',
      },
    ]);
  });

  test('builds a top Story with no folders at all', () => {
    expect(buildStoryTree('std', [])).toMatchObject({
      id: 'std',
      stories: [],
      proofs: [],
      issues: [{ kind: 'missing-telling' }],
    });
  });
});

describe('narrowStoryTree', () => {
  const tree = buildStoryTree('std', [
    folder('', '# Std\n\nP.\n\n[a](std/a) [b](std/b)', ['top']),
    folder('a', '# A\n\nP.', ['one', 'two']),
    folder('b', '# B\n\nP.', ['three']),
  ]);

  test('keeps everything for the top Story', () => {
    expect(narrowStoryTree(tree, 'std')).toBe(tree);
  });

  test('keeps a Story with its ancestors and everything beneath', () => {
    const narrowed = narrowStoryTree(tree, 'std/a')!;
    expect(proofsOf(narrowed).map(({ id }) => id)).toEqual([
      'std/a/one',
      'std/a/two',
    ]);
    expect(narrowed.title).toBe('Std');
  });

  test('keeps one Proof', () => {
    expect(
      proofsOf(narrowStoryTree(tree, 'std/a/two')!).map(({ id }) => id),
    ).toEqual(['std/a/two']);
  });

  test('is null when nothing matches', () => {
    expect(narrowStoryTree(tree, 'std/nowhere')).toBeNull();
    expect(narrowStoryTree(tree, 'other')).toBeNull();
  });
});
