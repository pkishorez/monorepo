import { Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';

import type { Branches } from '../../server/rpc/git/contract/index.js';
import type { ProjectEntry } from '../../server/rpc/projects/contract/index.js';
import type {
  PackageContents,
  Workspace,
} from '../../server/rpc/project/contract/index.js';
import { Monoverse, PlaceSchema, type Place } from '../index.js';
import {
  Projects,
  type ProjectsService,
} from '../../services/projects/contract/index.js';

const HostShape = Actor.define('Host', {
  input: PlaceSchema,
  model: Schema.Struct({
    place: PlaceSchema,
    moved: Schema.Array(PlaceSchema),
  }),
  message: {
    Moved: { place: PlaceSchema },
    Go: { place: PlaceSchema },
  },
});

const Host = HostShape.build({
  init: (place) => ({ model: { place, moved: [] } }),
  children: {
    monoverse: Actor.child(Monoverse, {
      input: ({ model }) => model.place,
      props: ({ model }) => model.place,
      emits: { Moved: ({ _tag, ...place }) => ({ _tag: 'Moved', place }) },
    }),
  },
  on: {
    Moved: ({ place }, { model }) => ({
      model: { place, moved: [...model.moved, place] },
    }),
    Go: ({ place }) => ({ model: { place } }),
  },
});

const place = (fields: Partial<Place> = {}): Place => ({
  project: null,
  package: null,
  branch: null,
  base: null,
  changes: false,
  ...fields,
});

const entry = (id: string, path: string): ProjectEntry => ({
  id,
  path,
  name: path.slice(1),
  addedAt: 1,
});

const monorepo: Workspace = {
  kind: 'monorepo',
  name: 'mono',
  path: '/repo',
  packageManager: 'pnpm',
  packages: [
    {
      name: '@me/core',
      path: 'packages/core',
      private: false,
      dependencies: [],
      check: { _tag: 'Unchecked' },
    },
    {
      name: 'web',
      path: 'apps/web',
      private: true,
      dependencies: [{ name: '@me/core', kinds: ['runtime'] }],
      check: { _tag: 'Checked', violations: [] },
    },
  ],
  cycles: [],
  files: ['package.json', 'docs/notes.md'],
};

const single: Workspace = {
  kind: 'single-package',
  name: 'solo',
  path: '/solo',
  packageManager: 'npm',
  packages: [
    {
      name: 'solo',
      path: '.',
      private: false,
      dependencies: [],
      check: { _tag: 'Unchecked' },
    },
  ],
  cycles: [],
  files: [],
};

const contents = (path: string): PackageContents => {
  const at = (file: string) => (path === '' ? file : `${path}/${file}`);
  return {
    path,
    files: [at('src/index.ts'), at('src/app/actor.ts'), at('README.md')],
    sourceRoots: [at('src')],
    imports: [[at('src/app/actor.ts'), at('src/index.ts')]],
    check: {
      _tag: 'Checked',
      violations: [
        {
          from: at('src/app/actor.ts'),
          line: 1,
          column: 22,
          to: at('src/index.ts'),
          reason: 'door',
          message: "'src/index.ts' is beside or above this file.",
        },
      ],
    },
  };
};

const branches: Branches = {
  current: 'feature',
  defaultBase: 'main',
  branches: [
    { name: 'feature', worktree: '/repo' },
    { name: 'main', worktree: null },
    { name: 'next', worktree: '/next' },
  ],
};

type Asked = Array<readonly [string, unknown]>;

const service = (asked: Asked): ProjectsService => {
  const answer =
    <A, I>(name: string, value: (input: I) => A) =>
    (input: I) =>
      Effect.sync(() => {
        asked.push([name, input]);
        return value(input);
      });
  return {
    projects: answer('projects', () => [
      entry('m', '/repo'),
      entry('s', '/solo'),
    ]),
    addProject: () => Effect.never,
    removeProject: () => Effect.never,
    listFolders: () => Effect.never,
    analyse: answer('analyse', ({ root }: { root: string }) => {
      const workspace = root === '/repo' ? monorepo : single;
      return {
        workspace,
        links:
          workspace === monorepo
            ? ([['apps/web', 'packages/core']] as const)
            : [],
        cycles: [],
      };
    }),
    readPackage: answer('readPackage', ({ path }: { path: string }) =>
      contents(path === '.' ? '' : path),
    ),
    branches: answer('branches', () => branches),
    changes: answer('changes', () => ({ baseRef: 'abc123', files: [] })),
    readFile: answer('readFile', ({ path }: { path: string }) => ({
      path,
      content: 'text',
    })),
    fileDiff: answer('fileDiff', ({ path }: { path: string }) => ({
      path,
      hunks: [],
    })),
  };
};

const layer = (asked: Asked) => Layer.succeed(Projects)(service(asked));

const settle = Effect.promise(
  () => new Promise((done) => setTimeout(done, 20)),
);
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];
type App = Runtime<typeof Host>;

const find = (app: App, actor: string) =>
  walk(app.snapshot.root).find((each) => each.actor === actor);
const tool = (app: App) => find(app, 'Monoverse')!;
const host = (app: App) =>
  app.snapshot.root.model as { place: Place; moved: ReadonlyArray<Place> };
const send = (
  app: App,
  actor: string,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) => app.at(find(app, actor)!.address)!.send(message as any);
const named = (asked: Asked, name: string) =>
  asked.filter(([each]) => each === name).map(([, input]) => input);

const start = (at: Partial<Place>, asked: Asked = []) =>
  Runtime.scoped(Host, {
    input: place(at),
    layer: layer(asked),
  });

describe('Monoverse', () => {
  it('opens the project its Input names as a Project, at the Place', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm', base: 'next' }, asked);
        yield* settle;
        expect(tool(app).state).toEqual({
          _tag: 'Showing',
          project: 'm',
          root: '/repo',
        });
        expect(find(app, 'Project')!.props).toEqual({
          name: 'repo',
          package: null,
          branch: null,
          base: 'next',
          changes: false,
          deleted: true,
          unchanged: 'dim',
          ignored: true,
        });
        expect(find(app, 'Project')!.state).toMatchObject({
          _tag: 'Monorepo',
        });
        expect(named(asked, 'analyse')).toEqual([
          { root: '/repo', branch: null },
        ]);
        expect(host(app).moved).toEqual([]);
      }),
    ));

  it('moves the Place as a Package is entered in the Project, and left', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm' });
        yield* settle;
        send(app, 'Tree', { _tag: 'Entered', path: 'apps/web' });
        yield* settle;
        expect(host(app).place).toEqual(
          place({ project: 'm', package: 'apps/web' }),
        );
        expect(find(app, 'Project')!.props).toMatchObject({
          package: 'apps/web',
        });
        expect(find(app, 'Package')!.model).toMatchObject({
          path: 'apps/web',
        });
        send(app, 'Project', { _tag: 'Left' });
        yield* settle;
        expect(find(app, 'Package')).toBeUndefined();
        expect(host(app).moved.map((one) => one.package)).toEqual([
          'apps/web',
          null,
        ]);
      }),
    ));

  it('shows the picker for a project not saved, says so, and opens one picked', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'gone', branch: 'x' });
        yield* settle;
        expect(tool(app).state).toEqual({ _tag: 'Picking' });
        expect(find(app, 'ProjectPicker')).toBeDefined();
        expect(host(app).moved).toEqual([place({ branch: 'x' })]);
        send(app, 'Monoverse', {
          _tag: 'Picked',
          project: entry('n', '/repo'),
        });
        yield* settle;
        expect(tool(app).state).toMatchObject({
          _tag: 'Showing',
          project: 'n',
        });
        expect(find(app, 'Project')!.state).toMatchObject({
          _tag: 'Monorepo',
        });
        expect(find(app, 'ProjectPicker')).toBeUndefined();
        expect(host(app).place).toEqual(place({ project: 'n' }));
      }),
    ));

  it("opens the picker over an open project from the Project's crumb, and closes it", () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm' });
        yield* settle;
        const project = find(app, 'Project')!.address;
        send(app, 'Project', { _tag: 'SwitchAsked' });
        expect(find(app, 'ProjectPicker')!.props).toEqual({ current: 'm' });
        send(app, 'Monoverse', { _tag: 'Dismissed' });
        expect(find(app, 'ProjectPicker')).toBeUndefined();
        expect(find(app, 'Project')!.address).toBe(project);
      }),
    ));

  it('keeps the same Project as another branch is chosen in it, the views on screen', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm', package: 'apps/web' }, asked);
        yield* settle;
        const project = find(app, 'Project')!.address;
        send(app, 'Project', { _tag: 'BranchChosen', branch: 'next' });
        yield* settle;
        expect(host(app).place).toMatchObject({ branch: 'next' });
        expect(tool(app).model).toMatchObject({ branch: 'next' });
        expect(find(app, 'Project')!.address).toBe(project);
        expect(named(asked, 'analyse')).toEqual([
          { root: '/repo', branch: null },
          { root: '/repo', branch: 'next' },
        ]);
        expect(named(asked, 'readPackage')).toEqual([
          { root: '/repo', branch: null, path: 'apps/web' },
          { root: '/repo', branch: 'next', path: 'apps/web' },
        ]);
        send(app, 'Project', { _tag: 'BranchChosen', branch: 'feature' });
        expect(host(app).place).toMatchObject({ branch: null });
      }),
    ));

  it('keeps how the trees are drawn as another project opens', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm' });
        yield* settle;
        send(app, 'Project', { _tag: 'DeletedToggled' });
        send(app, 'Project', { _tag: 'UnchangedChosen', unchanged: 'hide' });
        send(app, 'Project', { _tag: 'IgnoredToggled' });
        app.root.send({ _tag: 'Go', place: place({ project: 's' }) });
        yield* settle;
        expect(find(app, 'Project')!.props).toMatchObject({
          deleted: false,
          unchanged: 'hide',
          ignored: false,
        });
        expect(find(app, 'Tree')!.props).toMatchObject({
          unchanged: 'hide',
          ignored: false,
        });
      }),
    ));

  it('turns Changes on as a Package is viewed for its changes, and says so', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm' });
        yield* settle;
        send(app, 'Tree', { _tag: 'Viewed', path: 'apps/web', files: [] });
        expect(host(app).place).toEqual(place({ project: 'm', changes: true }));
        expect(find(app, 'Project')!.props).toMatchObject({ changes: true });
      }),
    ));

  it('moves the same Monoverse to the Place its Props name, and says nothing', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm' }, asked);
        yield* settle;
        const before = tool(app).address;
        const first = find(app, 'Project')!.address;

        app.root.send({ _tag: 'Go', place: place({ project: 's' }) });
        yield* settle;
        expect(tool(app).address).toBe(before);
        expect(tool(app).state).toEqual({
          _tag: 'Showing',
          project: 's',
          root: '/solo',
        });
        expect(find(app, 'Project')!.address).not.toBe(first);
        expect(find(app, 'Project')!.state).toMatchObject({ _tag: 'Package' });

        app.root.send({
          _tag: 'Go',
          place: place({ project: 'm', package: 'packages/core' }),
        });
        yield* settle;
        expect(find(app, 'Project')!.state).toMatchObject({
          _tag: 'Monorepo',
        });
        expect(find(app, 'Package')!.model).toMatchObject({
          path: 'packages/core',
        });

        app.root.send({ _tag: 'Go', place: place() });
        yield* settle;
        expect(tool(app).state).toEqual({ _tag: 'Picking' });
        expect(find(app, 'Project')).toBeUndefined();

        expect(named(asked, 'projects')).toHaveLength(2);
        expect(host(app).moved).toEqual([]);
      }),
    ));

  it('changes nothing when its own move comes back as Props', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm' }, asked);
        yield* settle;
        send(app, 'Project', { _tag: 'BranchChosen', branch: 'next' });
        send(app, 'Project', { _tag: 'ChangesToggled' });
        yield* settle;
        expect(tool(app).props).toEqual(
          place({ project: 'm', branch: 'next', changes: true }),
        );
        expect(host(app).moved).toHaveLength(2);
        expect(named(asked, 'analyse')).toHaveLength(2);
      }),
    ));

  it('stands on its own as the root, with no Props', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Monoverse, {
          input: place({ project: 'm' }),
          layer: layer([]),
        });
        yield* settle;
        expect(app.snapshot.root.props).toBeUndefined();
        expect(app.snapshot.root.state).toMatchObject({
          _tag: 'Showing',
          project: 'm',
        });
        const project = (app.snapshot.root.children as any).project as Instance;
        expect(project.state).toMatchObject({ _tag: 'Monorepo' });
      }),
    ));
});
