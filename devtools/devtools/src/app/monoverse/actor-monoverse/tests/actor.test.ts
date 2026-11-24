import { Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';

import {
  MonoverseClient,
  type MonoverseClientService,
} from '../../services/monoverse-client/contract/index.js';
import type {
  Branches,
  ChangeSet,
} from '../../server/rpc/git/contract/index.js';
import type { ProjectEntry } from '../../server/rpc/project-registry/contract/index.js';
import type {
  PackageContents,
  Workspace,
} from '../../server/rpc/project/contract/index.js';
import { Monoverse, PlaceSchema, type Place } from '../index.js';
import {
  Monorepo,
  MonorepoProblem,
  type MonorepoService,
} from '../../services/monorepo/contract/index.js';
import { violationsOf } from '../../services/monorepo/real/rules.js';

/*
 * Monoverse in memory, on a Monorepo service that answers what the test
 * says, mounted by a host that keeps the Place it hears of and hands it
 * back as Props, as the page does with the address: the project its
 * Input names opens in the Monorepo's tree, a Single Package goes straight
 * to its Package, a Package is entered and left, the branch and Compare
 * to move the Place, Changes reads what the branch changed, and the host
 * naming another Place moves the same Monoverse there.
 */

const Host = Actor.define('Host', {
  input: PlaceSchema,
  model: Schema.Struct({
    /** What the host names, as an address would. */
    place: PlaceSchema,
    moved: Schema.Array(PlaceSchema),
  }),
  message: {
    Moved: { place: PlaceSchema },
    /** Back, Forward or a typed address. */
    Go: { place: PlaceSchema },
  },
});

const HostLive = Host.build({
  init: (place) => ({ model: { place, moved: [] } }),
  children: {
    monoverse: Actor.child(Monoverse, {
      input: ({ model }) => model.place,
      props: ({ model }) => model.place,
      emits: { Moved: ({ _tag, ...place }) => ({ _tag: 'Moved', place }) },
    }),
  },
  on: {
    // Written down, as the page writes the address.
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
    },
    {
      name: 'web',
      path: 'apps/web',
      private: true,
      dependencies: [{ name: '@me/core', kinds: ['runtime'] }],
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
  packages: [{ name: 'solo', path: '.', private: false, dependencies: [] }],
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

const changeSet: ChangeSet = {
  baseRef: 'abc123',
  files: [
    { path: 'apps/web/src/index.ts', status: 'modified' },
    { path: 'docs/gone.md', status: 'deleted' },
  ],
};

/** Every call the service was asked, with what. */
type Asked = Array<readonly [string, unknown]>;

/** The service as the test says. */
const service = (asked: Asked): MonorepoService => {
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
    analyse: answer('analyse', ({ root }: { root: string }) => {
      const workspace = root === '/repo' ? monorepo : single;
      // The Package links the real service works out of each workspace.
      return {
        workspace,
        links:
          workspace === monorepo
            ? ([['apps/web', 'packages/core']] as const)
            : [],
        cycles: [],
      };
    }),
    readPackage: answer('readPackage', ({ path }: { path: string }) => {
      const read = contents(path === '.' ? '' : path);
      return { contents: read, violations: violationsOf(read.imports) };
    }),
    branches: answer('branches', () => branches),
    changes: answer('changes', () => changeSet),
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

/** The picker's client: it lists nothing the tests read, and never answers the rest. */
const client = Layer.succeed(MonoverseClient)(
  new Proxy({} as MonoverseClientService, {
    get: (_, method: string) => () =>
      method === 'ListProjects' ? Effect.succeed([]) : Effect.never,
  }),
);

const layer = (asked: Asked, overrides: Partial<MonorepoService> = {}) =>
  Layer.merge(
    Layer.succeed(Monorepo)({ ...service(asked), ...overrides }),
    client,
  );

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
type App = Runtime<typeof HostLive>;

const find = (app: App, actor: string) =>
  walk(app.snapshot.root).find((each) => each.actor === actor);
const tool = (app: App) => find(app, 'Monoverse')!;
const host = (app: App) =>
  app.snapshot.root.model as { place: Place; moved: ReadonlyArray<Place> };
const send = (
  app: App,
  actor: string,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) =>
  // oxlint-disable-next-line typescript/no-explicit-any -- any Actor's Message
  app.at(find(app, actor)!.address)!.send(message as any);
const named = (asked: Asked, name: string) =>
  asked.filter(([each]) => each === name).map(([, input]) => input);

const start = (
  at: Partial<Place>,
  asked: Asked = [],
  overrides: Partial<MonorepoService> = {},
) =>
  Runtime.scoped(HostLive, {
    input: place(at),
    layer: layer(asked, overrides),
  });

describe('Monoverse', () => {
  it('opens the project its Input names in the Monorepo tree, each Package one node', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm' }, asked);
        yield* settle;
        expect(tool(app).state).toMatchObject({
          _tag: 'Monorepo',
          project: 'm',
          root: '/repo',
        });
        expect(named(asked, 'analyse')).toEqual([
          { root: '/repo', branch: null },
        ]);
        expect(tool(app).model).toMatchObject({ branches });
        const tree = find(app, 'Tree')!;
        expect(tree.props).toMatchObject({
          base: '',
          name: 'repo',
          files: ['package.json', 'docs/notes.md'],
          packages: [
            { path: 'packages/core', name: '@me/core' },
            { path: 'apps/web', name: 'web' },
          ],
          links: [['apps/web', 'packages/core']],
          broken: [],
          changes: null,
        });
        expect(tree.model).toMatchObject({ open: ['apps', 'packages'] });
        // Started from the Input: nothing to tell.
        expect(host(app).moved).toEqual([]);
      }),
    ));

  it('enters a Package on a double click, at the branch, and leaves it from the crumb', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm' }, asked);
        yield* settle;
        send(app, 'Tree', { _tag: 'Entered', path: 'apps/web' });
        yield* settle;
        expect(host(app).place).toEqual(
          place({ project: 'm', package: 'apps/web' }),
        );
        expect(find(app, 'Package')!.state).toMatchObject({
          _tag: 'Contents',
          violations: [['apps/web/src/app/actor.ts', 'apps/web/src/index.ts']],
        });
        expect(named(asked, 'readPackage')).toEqual([
          { root: '/repo', branch: null, path: 'apps/web' },
        ]);
        send(app, 'Monoverse', { _tag: 'Left' });
        yield* settle;
        expect(find(app, 'Package')).toBeUndefined();
        expect(host(app).moved.map((one) => one.package)).toEqual([
          'apps/web',
          null,
        ]);
      }),
    ));

  it('takes a Single Package straight to its Package', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 's' });
        yield* settle;
        expect(tool(app).state).toMatchObject({ _tag: 'Package' });
        expect(find(app, 'Tree')!.props).toMatchObject({
          base: '',
          sourceRoots: ['src'],
        });
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
          _tag: 'Monorepo',
          project: 'n',
        });
        expect(find(app, 'ProjectPicker')).toBeUndefined();
        // Another project opens at its own branch.
        expect(host(app).place).toEqual(place({ project: 'n' }));
      }),
    ));

  it('opens the picker over an open project, and closes it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm' });
        yield* settle;
        send(app, 'Monoverse', { _tag: 'SwitchAsked' });
        expect(find(app, 'ProjectPicker')!.props).toEqual({ current: 'm' });
        send(app, 'Monoverse', { _tag: 'Dismissed' });
        expect(find(app, 'ProjectPicker')).toBeUndefined();
        expect(tool(app).state).toMatchObject({ _tag: 'Monorepo' });
      }),
    ));

  it('analyses another branch with the views on screen, and names the current one as none', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm', package: 'apps/web' }, asked);
        yield* settle;
        const monorepo = find(app, 'Monorepo')!.address;
        send(app, 'Monoverse', { _tag: 'BranchChosen', branch: 'next' });
        yield* settle;
        expect(host(app).place).toMatchObject({ branch: 'next' });
        expect(named(asked, 'analyse')).toEqual([
          { root: '/repo', branch: null },
          { root: '/repo', branch: 'next' },
        ]);
        expect(find(app, 'Monorepo')!.address).toEqual(monorepo);
        expect(named(asked, 'readPackage')).toEqual([
          { root: '/repo', branch: null, path: 'apps/web' },
          { root: '/repo', branch: 'next', path: 'apps/web' },
        ]);
        send(app, 'Monoverse', { _tag: 'BranchChosen', branch: 'feature' });
        expect(host(app).place).toMatchObject({ branch: null });
      }),
    ));

  it('reads what the branch changed while Changes is on, and colours the tree', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm' }, asked);
        yield* settle;
        expect(named(asked, 'changes')).toEqual([]);
        send(app, 'Monoverse', { _tag: 'ChangesToggled' });
        yield* settle;
        expect(host(app).place).toMatchObject({ changes: true });
        expect(named(asked, 'changes')).toEqual([
          { root: '/repo', branch: null, base: 'main' },
        ]);
        expect(find(app, 'Tree')!.props).toMatchObject({
          changes: changeSet.files,
        });
        send(app, 'Monoverse', { _tag: 'ChangesToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({ changes: null });
      }),
    ));

  it('reads no changes while the branch is the one compared to', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start(
          { project: 'm', base: 'feature', changes: true },
          asked,
        );
        yield* settle;
        expect(named(asked, 'changes')).toEqual([]);
        expect(find(app, 'Tree')!.props).toMatchObject({ changes: null });
      }),
    ));

  it('opens a file beside the tree, as its diff once the branch changed it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm', branch: 'next' });
        yield* settle;
        send(app, 'Tree', { _tag: 'Opened', path: 'docs/notes.md' });
        expect(find(app, 'FileViewer')!.model).toEqual({
          root: '/repo',
          branch: 'next',
          path: 'docs/notes.md',
          base: null,
          status: null,
          inside: false,
        });
        send(app, 'FileViewer', { _tag: 'Closed' });
        expect(find(app, 'FileViewer')).toBeUndefined();

        send(app, 'Monoverse', { _tag: 'ChangesToggled' });
        yield* settle;
        send(app, 'Tree', { _tag: 'Opened', path: 'apps/web/src/index.ts' });
        yield* settle;
        expect(find(app, 'FileViewer')!.model).toMatchObject({
          base: 'main',
          status: 'modified',
        });
        expect(find(app, 'FileViewer')!.state).toMatchObject({ _tag: 'Diff' });
      }),
    ));

  it('says why a project cannot be opened, in a sentence', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm' }, [], {
          analyse: () =>
            Effect.fail(
              new MonorepoProblem({
                reason: 'missing',
                message: '~/repo does not exist.',
              }),
            ),
        });
        yield* settle;
        expect(tool(app).state).toMatchObject({
          _tag: 'Failure',
          problem: '~/repo does not exist.',
          missing: true,
        });
      }),
    ));

  it('moves the same Monoverse to the Place its Props name, and says nothing', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm' }, asked);
        yield* settle;
        const before = tool(app).address;

        app.root.send({ _tag: 'Go', place: place({ project: 's' }) });
        yield* settle;
        expect(tool(app).address).toBe(before);
        expect(tool(app).state).toMatchObject({
          _tag: 'Package',
          project: 's',
          root: '/solo',
        });

        app.root.send({
          _tag: 'Go',
          place: place({ project: 'm', package: 'packages/core' }),
        });
        yield* settle;
        expect(tool(app).state).toMatchObject({ _tag: 'Monorepo' });
        expect(find(app, 'Package')!.model).toMatchObject({
          path: 'packages/core',
        });

        app.root.send({ _tag: 'Go', place: place() });
        yield* settle;
        expect(tool(app).state).toEqual({ _tag: 'Picking' });

        // The projects were listed once, and the host was told nothing.
        expect(named(asked, 'projects')).toHaveLength(1);
        expect(host(app).moved).toEqual([]);
      }),
    ));

  it('changes nothing when its own move comes back as Props', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm' }, asked);
        yield* settle;
        send(app, 'Monoverse', { _tag: 'BranchChosen', branch: 'next' });
        send(app, 'Monoverse', { _tag: 'ChangesToggled' });
        yield* settle;
        expect(tool(app).props).toEqual(
          place({ project: 'm', branch: 'next', changes: true }),
        );
        expect(host(app).moved).toHaveLength(2);
        // Analysed once at each branch: the move handed back did nothing.
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
          _tag: 'Monorepo',
          project: 'm',
        });
      }),
    ));

  it('views a folder: what changed in it while Changes is on, every file else; one of file and folder at a time', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm', package: 'apps/web' });
        yield* settle;
        // The Package's own tree, inside the Monorepo's.
        const inner = walk(app.snapshot.root)
          .filter((each) => each.actor === 'Tree')
          .at(-1)!;
        // oxlint-disable-next-line typescript/no-explicit-any -- any Actor's Message
        app.at(inner.address)!.send({
          _tag: 'Viewed',
          path: 'apps/web/src',
          files: ['apps/web/src/index.ts', 'apps/web/src/app/actor.ts'],
        } as any);
        yield* settle;
        expect(find(app, 'FolderViewer')!.model).toMatchObject({
          root: '/repo',
          base: null,
          path: 'apps/web/src',
          title: 'apps/web/src',
          files: ['apps/web/src/index.ts', 'apps/web/src/app/actor.ts'],
          // The Package's, so its ignored files can be told apart.
          sourceRoots: ['apps/web/src'],
        });
        expect(find(app, 'FileViewer')!.model).toMatchObject({
          path: 'apps/web/src/app/actor.ts',
        });

        send(app, 'Monoverse', { _tag: 'ChangesToggled' });
        yield* settle;
        expect(find(app, 'FolderViewer')!.model).toMatchObject({
          base: 'main',
          changed: [{ path: 'apps/web/src/index.ts', status: 'modified' }],
        });
        // The first changed file, though an unchanged one comes first.
        expect(find(app, 'FileViewer')!.model).toMatchObject({
          path: 'apps/web/src/index.ts',
        });

        send(app, 'Tree', { _tag: 'Opened', path: 'apps/web/README.md' });
        expect(find(app, 'FolderViewer')).toBeUndefined();
        expect(find(app, 'FileViewer')!.model).toMatchObject({
          path: 'apps/web/README.md',
        });
      }),
    ));

  it("views a Package's changes from the Monorepo's tree, turning Changes on", () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ project: 'm' }, asked);
        yield* settle;
        send(app, 'Tree', { _tag: 'Viewed', path: 'apps/web', files: [] });
        // Changes turns on, in the Monorepo's tree still.
        expect(host(app).place).toMatchObject({ package: null, changes: true });
        yield* settle;
        expect(named(asked, 'changes')).toHaveLength(1);
        expect(find(app, 'FolderViewer')!.model).toMatchObject({
          path: 'apps/web',
          base: 'main',
          changed: [{ path: 'apps/web/src/index.ts', status: 'modified' }],
        });
      }),
    ));

  it("views the repository's root by the project's name", () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm', changes: true });
        yield* settle;
        send(app, 'Tree', { _tag: 'Viewed', path: '', files: [] });
        yield* settle;
        expect(find(app, 'FolderViewer')!.model).toMatchObject({
          title: 'repo',
          changed: changeSet.files,
        });
        send(app, 'FolderViewer', { _tag: 'Closed' });
        expect(find(app, 'FolderViewer')).toBeUndefined();
      }),
    ));

  it("draws a folder looked into by the tree's settings, and changes them for both", () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm', changes: true });
        yield* settle;
        send(app, 'Tree', { _tag: 'Viewed', path: '', files: [] });
        yield* settle;
        expect(find(app, 'FolderViewer')!.props).toEqual({
          unchanged: 'dim',
          deleted: true,
          ignored: true,
        });
        send(app, 'FolderViewer', {
          _tag: 'UnchangedChosen',
          unchanged: 'hide',
        });
        send(app, 'FolderViewer', { _tag: 'IgnoredToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({
          unchanged: 'hide',
          ignored: false,
        });
        expect(find(app, 'FolderViewer')!.props).toMatchObject({
          unchanged: 'hide',
          ignored: false,
        });
      }),
    ));

  it('leaves out the deleted files, from the tree and a folder looked into alike', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm', changes: true });
        yield* settle;
        send(app, 'Monoverse', { _tag: 'DeletedToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({
          changes: [changeSet.files[0]],
        });

        // Looked into, the folder starts without them, and brings them back.
        send(app, 'Tree', { _tag: 'Viewed', path: '', files: [] });
        yield* settle;
        expect(find(app, 'FolderViewer')!.model).toMatchObject({
          changed: changeSet.files,
        });
        expect(find(app, 'FolderViewer')!.props).toMatchObject({
          deleted: false,
        });
        send(app, 'FolderViewer', { _tag: 'DeletedToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({
          changes: changeSet.files,
        });
        expect(find(app, 'FolderViewer')!.props).toMatchObject({
          deleted: true,
        });
      }),
    ));

  it('draws what the branch left unchanged faded, to start with, or as chosen', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm', changes: true });
        yield* settle;
        expect(find(app, 'Tree')!.props).toMatchObject({ unchanged: 'dim' });
        send(app, 'Monoverse', { _tag: 'UnchangedChosen', unchanged: 'hide' });
        expect(find(app, 'Tree')!.props).toMatchObject({ unchanged: 'hide' });
      }),
    ));

  it("draws a Package's ignored files to start with, and leaves them out once asked, in it too", () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ project: 'm', package: 'apps/web' });
        yield* settle;
        expect(find(app, 'Tree')!.props).toMatchObject({ ignored: true });
        send(app, 'Monoverse', { _tag: 'IgnoredToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({ ignored: false });
      }),
    ));
});
