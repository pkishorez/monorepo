import { Effect, Layer } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';

import {
  Monorepo,
  type MonorepoService,
} from '../../services/monorepo/index.js';
import { FolderViewerLive, entriesOf } from '../index.js';

/*
 * A folder looked into, on a service that answers what the test says:
 * the changed files while Changes is on, every file while it is off, the
 * first one shown to start with, and another when it is chosen.
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
  deleted: true,
});

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
  it('lists the changed files, by path, while Changes is on', () => {
    expect(entriesOf(input('main'))).toEqual([
      { path: 'src/a/x.ts', status: 'modified' },
      { path: 'src/gone.ts', status: 'deleted' },
    ]);
  });

  it('lists every file while Changes is off', () => {
    expect(entriesOf(input(null)).map(({ path }) => path)).toEqual([
      'src/a/x.ts',
      'src/b.ts',
      'src/gone.ts',
    ]);
  });

  it('shows the first file to start with, as its diff once changed, and another chosen', () =>
    run(
      Effect.gen(function* () {
        asked.length = 0;
        const app = yield* start('main');
        yield* settle;
        expect(app.snapshot.root.model).toMatchObject({
          selected: 'src/a/x.ts',
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

  it('leaves out the deleted files, and says so, the file shown giving way', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start('main');
        yield* settle;
        app.root.send({ _tag: 'Selected', path: 'src/gone.ts' });
        app.root.send({ _tag: 'DeletedToggled' });
        yield* settle;
        expect(app.snapshot.root.model).toMatchObject({
          deleted: false,
          selected: 'src/a/x.ts',
        });
        expect(entriesOf(app.snapshot.root.model as never)).toEqual([
          { path: 'src/a/x.ts', status: 'modified' },
        ]);
      }),
    ));

  it('steps to the file after or before the one shown, opening a closed folder on the way', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start(null);
        yield* settle;
        // In the list's order: src/a/x.ts, then src/b.ts, then src/gone.ts.
        expect(app.snapshot.root.model).toMatchObject({
          selected: 'src/a/x.ts',
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

  it('shows nothing when nothing changed', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(FolderViewerLive, {
          input: { ...input('main'), changed: [] },
          layer: Layer.succeed(Monorepo)(service),
        });
        expect(app.snapshot.root.model).toMatchObject({ selected: null });
        expect(fileOf(app.snapshot.root)).toBeUndefined();
      }),
    ));
});
