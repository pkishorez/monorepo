import { Effect, Layer } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';

import {
  Monorepo,
  type MonorepoService,
} from '../../services/monorepo/index.js';
import { FolderViewerLive, entriesOf, shownOf, stepFrom } from '../index.js';

/*
 * A folder looked into, on a service that answers what the test says: its
 * files drawn by the canvas's settings, the first changed one shown to
 * start with, another when it is chosen, and a step going between the
 * changed ones.
 */

const files = ['src/b.ts', 'src/a/x.ts', 'src/gone.ts'];
const changed = [
  { path: 'src/gone.ts', status: 'deleted' as const },
  { path: 'src/a/x.ts', status: 'modified' as const },
];

const asked: Array<string> = [];
const service = {
  readFile: ({ path }: { path: string }) =>
    Effect.sync(() => {
      asked.push(`read ${path}`);
      return { path, content: 'text' };
    }),
  fileDiff: ({ path }: { path: string }) =>
    Effect.sync(() => {
      asked.push(`diff ${path}`);
      return { path, hunks: [] };
    }),
} as unknown as MonorepoService;

const input = (base: string | null) => ({
  root: '/repo',
  branch: null,
  base,
  path: 'src',
  title: 'src',
  files,
  changed,
  sourceRoots: null,
});

const settings = (
  more: Partial<{
    unchanged: 'show' | 'dim' | 'hide';
    deleted: boolean;
    ignored: boolean;
  }> = {},
) => ({ unchanged: 'dim' as const, deleted: true, ignored: true, ...more });

const settle = Effect.promise(
  () => new Promise((done) => setTimeout(done, 20)),
);
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));
const start = (base: string | null) =>
  Runtime.scoped(FolderViewerLive, {
    input: input(base),
    layer: Layer.succeed(Monorepo)(service),
  });
const fileOf = (root: Instance) => root.children.file as Instance | undefined;

describe('FolderViewer', () => {
  it('lists every file while Changes is on, each changed one marked, unless the unchanged are hidden', () => {
    expect(entriesOf(input('main'), settings())).toEqual([
      { path: 'src/a/x.ts', status: 'modified', ignored: false },
      { path: 'src/b.ts', status: null, ignored: false },
      { path: 'src/gone.ts', status: 'deleted', ignored: false },
    ]);
    expect(
      entriesOf(input('main'), settings({ unchanged: 'hide' })).map(
        ({ path }) => path,
      ),
    ).toEqual(['src/a/x.ts', 'src/gone.ts']);
  });

  it('leaves out the deleted files, and the ignored ones, as the settings say', () => {
    expect(
      entriesOf(input('main'), settings({ deleted: false })).map(
        ({ path }) => path,
      ),
    ).toEqual(['src/a/x.ts', 'src/b.ts']);
    const rooted = { ...input('main'), sourceRoots: ['src/a'] };
    expect(entriesOf(rooted, settings())).toContainEqual({
      path: 'src/b.ts',
      status: null,
      ignored: true,
    });
    expect(
      entriesOf(rooted, settings({ ignored: false })).map(({ path }) => path),
    ).toEqual(['src/a/x.ts']);
  });

  it('lists every file while Changes is off, none marked', () => {
    expect(
      entriesOf(input(null), settings()).map(({ status }) => status),
    ).toEqual([null, null, null]);
  });

  it('shows the first changed file to start with, as its diff, and another chosen', () =>
    run(
      Effect.gen(function* () {
        asked.length = 0;
        const app = yield* start('main');
        yield* settle;
        expect(app.snapshot.root.model).toMatchObject({
          selected: null,
          showing: false,
        });
        expect(fileOf(app.snapshot.root)!.model).toMatchObject({
          path: 'src/a/x.ts',
          base: 'main',
          status: 'modified',
          inside: true,
        });
        expect(fileOf(app.snapshot.root)!.state).toMatchObject({
          _tag: 'Diff',
        });

        app.root.send({ _tag: 'Selected', path: 'src/gone.ts' });
        yield* settle;
        expect(app.snapshot.root.model).toMatchObject({
          selected: 'src/gone.ts',
          showing: true,
        });
        expect(asked).toContain('diff src/gone.ts');
        // A deleted file is only its diff.
        expect(asked).not.toContain('read src/gone.ts');

        // Its back arrow, on a phone, goes back to the list.
        app.at(fileOf(app.snapshot.root)!.address)!.send({
          _tag: 'Closed',
        } as never);
        expect(app.snapshot.root.model).toMatchObject({ showing: false });
      }),
    ));

  it('shows a file as text while Changes is off', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start(null);
        yield* settle;
        expect(fileOf(app.snapshot.root)!.state).toMatchObject({
          _tag: 'Text',
          content: 'text',
        });
      }),
    ));

  it('gives way to the first changed file when the settings leave out the one shown', () => {
    const model = { ...input('main'), selected: 'src/gone.ts' };
    expect(shownOf(model, settings())).toBe('src/gone.ts');
    expect(shownOf(model, settings({ deleted: false }))).toBe('src/a/x.ts');
  });

  it('steps between the changed files, from an unchanged one too', () => {
    const at = (selected: string) => ({ ...input('main'), selected });
    expect(stepFrom(at('src/a/x.ts'), settings(), 1)).toBe('src/gone.ts');
    // src/b.ts sits between the two changed files.
    expect(stepFrom(at('src/b.ts'), settings(), 1)).toBe('src/gone.ts');
    expect(stepFrom(at('src/b.ts'), settings(), -1)).toBe('src/a/x.ts');
    expect(stepFrom(at('src/gone.ts'), settings(), 1)).toBeNull();
  });

  it('steps to the file after or before the one shown, opening a closed folder on the way', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start(null);
        yield* settle;
        // In the list's order: src/a/x.ts, then src/b.ts, then src/gone.ts.
        expect(fileOf(app.snapshot.root)!.model).toMatchObject({
          path: 'src/a/x.ts',
        });
        app.root.send({ _tag: 'Stepped', by: 1 });
        expect(app.snapshot.root.model).toMatchObject({ selected: 'src/b.ts' });
        app.root.send({ _tag: 'Stepped', by: 1 });
        app.root.send({ _tag: 'Stepped', by: 1 });
        expect(app.snapshot.root.model).toMatchObject({
          selected: 'src/gone.ts',
        });
        app.root.send({ _tag: 'FolderToggled', path: 'src/a' });
        app.root.send({ _tag: 'Stepped', by: -2 });
        expect(app.snapshot.root.model).toMatchObject({
          selected: 'src/a/x.ts',
          closed: [],
        });
      }),
    ));

  it('closes a folder in the list, and opens it again', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start('main');
        app.root.send({ _tag: 'FolderToggled', path: 'src/a' });
        expect(app.snapshot.root.model).toMatchObject({ closed: ['src/a'] });
        app.root.send({ _tag: 'FolderToggled', path: 'src/a' });
        expect(app.snapshot.root.model).toMatchObject({ closed: [] });
      }),
    ));

  it('closes every folder down to the top level, opening one only opens it; and opens them all again', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(FolderViewerLive, {
          input: {
            ...input(null),
            files: ['src/p/q/r.ts', 'src/p/s.ts', 'src/t.ts'],
          },
          layer: Layer.succeed(Monorepo)(service),
        });
        const closed = () =>
          [...(app.snapshot.root.model as { closed: string[] }).closed].sort();
        app.root.send({ _tag: 'AllToggled' });
        expect(closed()).toEqual(['src/p', 'src/p/q']);
        app.root.send({ _tag: 'FolderToggled', path: 'src/p' });
        expect(closed()).toEqual(['src/p/q']);
        app.root.send({ _tag: 'AllToggled' });
        expect(closed()).toEqual([]);
      }),
    ));

  it('opens everything inside a folder, or closes every folder in it, the folder staying open', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(FolderViewerLive, {
          input: {
            ...input(null),
            files: ['src/p/q/r.ts', 'src/p/q/u/v.ts', 'src/p/s.ts'],
          },
          layer: Layer.succeed(Monorepo)(service),
        });
        const closed = () =>
          [...(app.snapshot.root.model as { closed: string[] }).closed].sort();
        app.root.send({ _tag: 'InsideToggled', path: 'src/p' });
        expect(closed()).toEqual(['src/p/q', 'src/p/q/u']);
        app.root.send({ _tag: 'InsideToggled', path: 'src/p' });
        expect(closed()).toEqual([]);
      }),
    ));

  it('shows nothing when there is nothing to list', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(FolderViewerLive, {
          input: { ...input('main'), files: [], changed: [] },
          layer: Layer.succeed(Monorepo)(service),
        });
        expect(fileOf(app.snapshot.root)).toBeUndefined();
      }),
    ));
});
