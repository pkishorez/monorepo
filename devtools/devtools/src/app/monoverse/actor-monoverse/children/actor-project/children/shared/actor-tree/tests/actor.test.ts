import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Snapshot } from '@kestack/kabuki';
import type { Address } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';
import { Tree } from '../index.js';
import type { TreeProps } from '../logic/index.js';

const props: TreeProps = {
  base: '',
  name: 'repo',
  files: ['src/a/x.ts', 'src/b.ts'],
  packages: [],
  links: [],
  broken: [],
  sourceRoots: null,
  changes: null,
  unchanged: 'dim' as const,
  ignored: true,
};

const Host = Actor.define('Host', {
  message: {
    Opened: { path: Schema.String },
    Entered: { path: Schema.String },
    Viewed: { path: Schema.String, files: Schema.Array(Schema.String) },
  },
}).build({
  children: {
    tree: Actor.child(Tree, {
      input: () => ({ open: ['src'] }),
      props: () => props,
      emits: {
        Opened: ({ path }) => ({ _tag: 'Opened', path }),
        Entered: ({ path }) => ({ _tag: 'Entered', path }),
        Viewed: ({ path, files }) => ({ _tag: 'Viewed', path, files }),
      },
    }),
  },
  on: { Opened: () => ({}), Entered: () => ({}), Viewed: () => ({}) },
});

const treeOf = (snapshot: Snapshot<typeof Host>) =>
  snapshot.root.children.tree as unknown as Instance;

const play = (...messages: ReadonlyArray<never>) => {
  let snapshot = Snapshot.init(Host);
  const emitted: Array<unknown> = [];
  for (const message of messages) {
    const next = Snapshot.next(Host, snapshot, {
      to: treeOf(snapshot).address as Address,
      message,
      from: { kind: 'outside' },
      at: 0,
    });
    snapshot = next.snapshot;
    emitted.push(...next.emitted.map((each) => each.message));
  }
  return { model: treeOf(snapshot).model, emitted };
};

describe('the tree', () => {
  it('opens and closes folders', () => {
    expect(play({ _tag: 'Toggled', path: 'src/a' } as never).model).toEqual({
      open: ['src', 'src/a'],
      home: ['src'],
      selected: null,
    });
    expect(play({ _tag: 'Toggled', path: 'src' } as never).model).toEqual({
      open: [],
      home: ['src'],
      selected: null,
    });
  });

  it('opens just the folders it is handed, the outermost one closed over the selection taking it', () => {
    expect(
      play({ _tag: 'OpenChosen', open: ['src', 'src/a'] } as never).model,
    ).toMatchObject({ open: ['src', 'src/a'], selected: null });
    const { model } = play(
      { _tag: 'Toggled', path: 'src/a' } as never,
      { _tag: 'Selected', path: 'src/a/x.ts' } as never,
      { _tag: 'OpenChosen', open: [] } as never,
    );
    expect(model).toMatchObject({ open: [], selected: 'src' });
  });

  it('selects the folder it closes over the selection, so it stays on screen', () => {
    const { model } = play(
      { _tag: 'Toggled', path: 'src/a' } as never,
      { _tag: 'Selected', path: 'src/a/x.ts' } as never,
      { _tag: 'Toggled', path: 'src' } as never,
    );
    expect(model).toMatchObject({ open: ['src/a'], selected: 'src' });
  });

  it('goes back to the default view: the folders open at first, nothing selected', () => {
    expect(
      play(
        { _tag: 'OpenChosen', open: ['src', 'src/a'] } as never,
        { _tag: 'Selected', path: 'src/b.ts' } as never,
        { _tag: 'Reset' } as never,
      ).model,
    ).toEqual({ open: ['src'], home: ['src'], selected: null });
  });

  it('lets a selection go on a second click, or a click on nothing', () => {
    expect(
      play(
        { _tag: 'Selected', path: 'src/b.ts' } as never,
        { _tag: 'Selected', path: 'src/b.ts' } as never,
      ).model,
    ).toMatchObject({ selected: null });
    expect(
      play(
        { _tag: 'Selected', path: 'src/b.ts' } as never,
        { _tag: 'Selected', path: null } as never,
      ).model,
    ).toMatchObject({ selected: null });
  });

  it('opens the folders a reveal names', () => {
    expect(
      play({ _tag: 'Revealed', folders: ['src', 'src/a'] } as never).model,
    ).toMatchObject({ open: ['src', 'src/a'] });
  });

  it('tells its parent a file was opened, or a Package entered', () => {
    expect(
      play(
        { _tag: 'Opened', path: 'src/b.ts' } as never,
        { _tag: 'Entered', path: 'packages/core' } as never,
      ).emitted,
    ).toEqual([
      { _tag: 'Opened', path: 'src/b.ts' },
      { _tag: 'Entered', path: 'packages/core' },
    ]);
  });

  it('tells its parent a folder was viewed, with every file in it', () => {
    expect(
      play({ _tag: 'Viewed', path: 'src/a', files: ['src/a/x.ts'] } as never)
        .emitted,
    ).toEqual([{ _tag: 'Viewed', path: 'src/a', files: ['src/a/x.ts'] }]);
  });
});
