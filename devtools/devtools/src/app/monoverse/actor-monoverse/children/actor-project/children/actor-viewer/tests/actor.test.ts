import { Effect, Layer } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';

import {
  Projects,
  type ProjectsService,
} from '../../../../../../services/projects/contract/index.js';
import { Viewer } from '../index.js';
import { entriesOf, shownOf, stepFrom } from '../logic/shared/index.js';

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
} as unknown as ProjectsService;

const input = (base: string | null) => ({
  _tag: 'Folder' as const,
  root: '/repo',
  branch: null,
  base,
  path: 'src',
  title: 'src',
  files,
  changed,
  sourceRoots: null,
});

const folderOf = (base: string | null, selected: string | null = null) => ({
  _tag: 'Folder' as const,
  base,
  path: 'src',
  title: 'src',
  files,
  changed,
  sourceRoots: null,
  selected,
  showing: false,
  closed: [],
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
  Runtime.scoped(Viewer, {
    input: input(base),
    layer: Layer.succeed(Projects)(service),
  });
const fileOf = (root: Instance) => root.children.file as Instance | undefined;

describe('Viewer', () => {
  it('opens a file alone, with its own close', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Viewer, {
          input: {
            _tag: 'File',
            root: '/repo',
            branch: 'next',
            path: 'src/b.ts',
            base: null,
            status: null,
          },
          layer: Layer.succeed(Projects)(service),
        });
        yield* settle;
        expect(app.snapshot.root.state).toMatchObject({ _tag: 'File' });
        expect(fileOf(app.snapshot.root)!.model).toEqual({
          root: '/repo',
          branch: 'next',
          path: 'src/b.ts',
          base: null,
          status: null,
          besideFolderList: false,
        });
        expect(fileOf(app.snapshot.root)!.state).toMatchObject({
          _tag: 'Text',
          content: 'text',
        });
      }),
    ));

  it('lists every file while Changes is on, each changed one marked, unless the unchanged are hidden', () => {
    expect(entriesOf(folderOf('main'), settings())).toEqual([
      { path: 'src/a/x.ts', status: 'modified', ignored: false },
      { path: 'src/b.ts', status: null, ignored: false },
      { path: 'src/gone.ts', status: 'deleted', ignored: false },
    ]);
    expect(
      entriesOf(folderOf('main'), settings({ unchanged: 'hide' })).map(
        ({ path }) => path,
      ),
    ).toEqual(['src/a/x.ts', 'src/gone.ts']);
  });

  it('leaves out the deleted files, and the ignored ones, as the settings say', () => {
    expect(
      entriesOf(folderOf('main'), settings({ deleted: false })).map(
        ({ path }) => path,
      ),
    ).toEqual(['src/a/x.ts', 'src/b.ts']);
    const rooted = { ...folderOf('main'), sourceRoots: ['src/a'] };
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
      entriesOf(folderOf(null), settings()).map(({ status }) => status),
    ).toEqual([null, null, null]);
  });

  it('shows the first changed file to start with, as its diff, and another chosen', () =>
    run(
      Effect.gen(function* () {
        asked.length = 0;
        const app = yield* start('main');
        yield* settle;
        expect(app.snapshot.root.state).toMatchObject({
          selected: null,
          showing: false,
        });
        expect(fileOf(app.snapshot.root)!.model).toMatchObject({
          path: 'src/a/x.ts',
          base: 'main',
          status: 'modified',
          besideFolderList: true,
        });
        expect(fileOf(app.snapshot.root)!.state).toMatchObject({
          _tag: 'Diff',
        });

        app.root.send({ _tag: 'Selected', path: 'src/gone.ts' });
        yield* settle;
        expect(app.snapshot.root.state).toMatchObject({
          selected: 'src/gone.ts',
          showing: true,
        });
        expect(asked).toContain('diff src/gone.ts');
        expect(asked).not.toContain('read src/gone.ts');

        app.at(fileOf(app.snapshot.root)!.address)!.send({
          _tag: 'Closed',
        } as never);
        expect(app.snapshot.root.state).toMatchObject({ showing: false });
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
    const model = folderOf('main', 'src/gone.ts');
    expect(shownOf(model, settings())).toBe('src/gone.ts');
    expect(shownOf(model, settings({ deleted: false }))).toBe('src/a/x.ts');
  });

  it('steps between the changed files, from an unchanged one too', () => {
    const at = (selected: string) => folderOf('main', selected);
    expect(stepFrom(at('src/a/x.ts'), settings(), 1)).toBe('src/gone.ts');
    expect(stepFrom(at('src/b.ts'), settings(), 1)).toBe('src/gone.ts');
    expect(stepFrom(at('src/b.ts'), settings(), -1)).toBe('src/a/x.ts');
    expect(stepFrom(at('src/gone.ts'), settings(), 1)).toBeNull();
  });

  it('steps to the file after or before the one shown, opening a closed folder on the way', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start(null);
        yield* settle;
        expect(fileOf(app.snapshot.root)!.model).toMatchObject({
          path: 'src/a/x.ts',
        });
        app.root.send({ _tag: 'Stepped', by: 1 });
        expect(app.snapshot.root.state).toMatchObject({ selected: 'src/b.ts' });
        app.root.send({ _tag: 'Stepped', by: 1 });
        app.root.send({ _tag: 'Stepped', by: 1 });
        expect(app.snapshot.root.state).toMatchObject({
          selected: 'src/gone.ts',
        });
        app.root.send({ _tag: 'FolderToggled', path: 'src/a' });
        app.root.send({ _tag: 'Stepped', by: -2 });
        expect(app.snapshot.root.state).toMatchObject({
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
        expect(app.snapshot.root.state).toMatchObject({ closed: ['src/a'] });
        app.root.send({ _tag: 'FolderToggled', path: 'src/a' });
        expect(app.snapshot.root.state).toMatchObject({ closed: [] });
      }),
    ));

  it('closes every folder down to the top level, opening one only opens it; and opens them all again', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Viewer, {
          input: {
            ...input(null),
            files: ['src/p/q/r.ts', 'src/p/s.ts', 'src/t.ts'],
          },
          layer: Layer.succeed(Projects)(service),
        });
        const closed = () =>
          [...(app.snapshot.root.state as { closed: string[] }).closed].sort();
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
        const app = yield* Runtime.scoped(Viewer, {
          input: {
            ...input(null),
            files: ['src/p/q/r.ts', 'src/p/q/u/v.ts', 'src/p/s.ts'],
          },
          layer: Layer.succeed(Projects)(service),
        });
        const closed = () =>
          [...(app.snapshot.root.state as { closed: string[] }).closed].sort();
        app.root.send({ _tag: 'InsideToggled', path: 'src/p' });
        expect(closed()).toEqual(['src/p/q', 'src/p/q/u']);
        app.root.send({ _tag: 'InsideToggled', path: 'src/p' });
        expect(closed()).toEqual([]);
      }),
    ));

  it('shows nothing when there is nothing to list', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Viewer, {
          input: { ...input('main'), files: [], changed: [] },
          layer: Layer.succeed(Projects)(service),
        });
        expect(fileOf(app.snapshot.root)).toBeUndefined();
      }),
    ));
});
