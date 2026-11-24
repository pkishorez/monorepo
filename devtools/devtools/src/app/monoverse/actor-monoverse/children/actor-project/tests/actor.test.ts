import { Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';

import type {
  Branches,
  ChangeSet,
} from '../../../../server/rpc/git/contract/index.js';
import type {
  PackageContents,
  Workspace,
} from '../../../../server/rpc/project/contract/index.js';
import {
  Projects,
  ProjectsProblem,
  type ProjectsService,
} from '../../../../services/projects/contract/index.js';
import { Project } from '../index.js';

/*
 * A Project in memory, on a Projects service that answers what the test
 * says, held by a host that keeps where the Project moves to and hands it
 * back as Props, with how the trees are drawn, as Monoverse does: a Monorepo opens in its tree, a Single
 * Package goes straight to its Package, a Package is entered and left,
 * another branch is analysed with the views on screen, Changes reads what
 * the branch changed, a file or a folder opens over the tree, and the
 * tree's settings draw both.
 */

const WhereSchema = Schema.Struct({
  package: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  base: Schema.NullOr(Schema.String),
  changes: Schema.Boolean,
});
type Where = typeof WhereSchema.Type;

const HostShape = Actor.define('Host', {
  input: Schema.Struct({ root: Schema.String, where: WhereSchema }),
  model: Schema.Struct({
    root: Schema.String,
    /** Where the host names, as Monoverse would. */
    where: WhereSchema,
    moved: Schema.Array(WhereSchema),
    switched: Schema.Number,
    /** How the trees are drawn, as Monoverse keeps it. */
    deleted: Schema.Boolean,
    unchanged: Schema.Literals(['show', 'dim', 'hide']),
    ignored: Schema.Boolean,
  }),
  message: {
    Moved: { where: WhereSchema },
    DeletedToggled: {},
    UnchangedChosen: { unchanged: Schema.Literals(['show', 'dim', 'hide']) },
    IgnoredToggled: {},
    /** Back, Forward or a typed address. */
    Go: { where: WhereSchema },
    SwitchAsked: {},
  },
});

const Host = HostShape.build({
  init: ({ root, where }) => ({
    model: {
      root,
      where,
      moved: [],
      switched: 0,
      deleted: true,
      unchanged: 'dim',
      ignored: true,
    },
  }),
  children: {
    project: Actor.child(Project, {
      input: ({ model }) => ({ root: model.root }),
      props: ({ model }) => ({
        name: 'repo',
        ...model.where,
        deleted: model.deleted,
        unchanged: model.unchanged,
        ignored: model.ignored,
      }),
      emits: {
        Moved: ({ _tag, ...where }) => ({ _tag: 'Moved', where }),
        DeletedToggled: () => ({ _tag: 'DeletedToggled' }),
        UnchangedChosen: ({ unchanged }) => ({
          _tag: 'UnchangedChosen',
          unchanged,
        }),
        IgnoredToggled: () => ({ _tag: 'IgnoredToggled' }),
        SwitchAsked: () => ({ _tag: 'SwitchAsked' }),
      },
    }),
  },
  on: {
    Moved: ({ where }, { model }) => ({
      model: { where, moved: [...model.moved, where] },
    }),
    Go: ({ where }) => ({ model: { where } }),
    DeletedToggled: (_, { model }) => ({ model: { deleted: !model.deleted } }),
    UnchangedChosen: ({ unchanged }) => ({ model: { unchanged } }),
    IgnoredToggled: (_, { model }) => ({ model: { ignored: !model.ignored } }),
    SwitchAsked: (_, { model }) => ({
      model: { switched: model.switched + 1 },
    }),
  },
});

const where = (fields: Partial<Where> = {}): Where => ({
  package: null,
  branch: null,
  base: null,
  changes: false,
  ...fields,
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

const changeSet: ChangeSet = {
  baseRef: 'abc123',
  files: [
    { path: 'apps/web/src/index.ts', status: 'modified' },
    { path: 'docs/gone.md', status: 'deleted' },
  ],
};

/** Every call the service was asked, with what. */
type Asked = Array<readonly [string, unknown]>;

/** The service as the test says; the picker's calls never answer. */
const service = (asked: Asked): ProjectsService => {
  const answer =
    <A, I>(name: string, value: (input: I) => A) =>
    (input: I) =>
      Effect.sync(() => {
        asked.push([name, input]);
        return value(input);
      });
  return {
    projects: () => Effect.never,
    addProject: () => Effect.never,
    removeProject: () => Effect.never,
    listFolders: () => Effect.never,
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
    readPackage: answer('readPackage', ({ path }: { path: string }) =>
      contents(path === '.' ? '' : path),
    ),
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
const project = (app: App) => find(app, 'Project')!;
const host = (app: App) =>
  app.snapshot.root.model as {
    where: Where;
    moved: ReadonlyArray<Where>;
    switched: number;
  };
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
  at: Partial<Where> = {},
  asked: Asked = [],
  overrides: Partial<ProjectsService> = {},
  root = '/repo',
) =>
  Runtime.scoped(Host, {
    input: { root, where: where(at) },
    layer: Layer.succeed(Projects)({ ...service(asked), ...overrides }),
  });

describe('Project', () => {
  it('opens a Monorepo in its tree, each Package one node', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({}, asked);
        yield* settle;
        expect(project(app).state).toMatchObject({ _tag: 'Monorepo' });
        expect(named(asked, 'analyse')).toEqual([
          { root: '/repo', branch: null },
        ]);
        expect(project(app).model).toMatchObject({ branches });
        const tree = find(app, 'Tree')!;
        expect(tree.props).toMatchObject({
          base: '',
          name: 'repo',
          files: ['package.json', 'docs/notes.md'],
          packages: [
            {
              path: 'packages/core',
              name: '@me/core',
              check: { _tag: 'Unchecked' },
            },
            {
              path: 'apps/web',
              name: 'web',
              check: { _tag: 'Checked', violations: [] },
            },
          ],
          links: [['apps/web', 'packages/core']],
          broken: [],
          changes: null,
        });
        expect(tree.model).toMatchObject({ open: ['apps', 'packages'] });
        // Opened where the host named: nothing to tell.
        expect(host(app).moved).toEqual([]);
      }),
    ));

  it('enters a Package on a double click, at the branch, and leaves it from the crumb', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({}, asked);
        yield* settle;
        send(app, 'Tree', { _tag: 'Entered', path: 'apps/web' });
        yield* settle;
        expect(host(app).where).toEqual(where({ package: 'apps/web' }));
        expect(find(app, 'Package')!.state).toMatchObject({
          _tag: 'Contents',
        });
        // Its Violations, as the server checked them, are the tree's broken links.
        const trees = walk(app.snapshot.root).filter(
          (each) => each.actor === 'Tree',
        );
        expect(
          trees.find(({ props }) => props.base === 'apps/web'),
        ).toMatchObject({
          props: {
            broken: [
              {
                from: 'apps/web/src/app/actor.ts',
                to: 'apps/web/src/index.ts',
                line: 1,
                column: 22,
                message: "'src/index.ts' is beside or above this file.",
              },
            ],
          },
        });
        expect(named(asked, 'readPackage')).toEqual([
          { root: '/repo', branch: null, path: 'apps/web' },
        ]);
        send(app, 'Project', { _tag: 'Left' });
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
        const app = yield* start({}, [], {}, '/solo');
        yield* settle;
        expect(project(app).state).toMatchObject({ _tag: 'Package' });
        expect(find(app, 'Package')!.model).toMatchObject({
          path: '.',
          name: 'repo',
        });
        expect(find(app, 'Tree')!.props).toMatchObject({
          base: '',
          sourceRoots: ['src'],
        });
      }),
    ));

  it('analyses another branch with the views on screen, and names the current one as none', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ package: 'apps/web' }, asked);
        yield* settle;
        const tree = find(app, 'Tree')!.address;
        send(app, 'Project', { _tag: 'BranchChosen', branch: 'next' });
        yield* settle;
        expect(host(app).where).toMatchObject({ branch: 'next' });
        expect(named(asked, 'analyse')).toEqual([
          { root: '/repo', branch: null },
          { root: '/repo', branch: 'next' },
        ]);
        // The Monorepo's tree stayed, under the Package entered.
        expect(find(app, 'Tree')!.address).toEqual(tree);
        expect(named(asked, 'readPackage')).toEqual([
          { root: '/repo', branch: null, path: 'apps/web' },
          { root: '/repo', branch: 'next', path: 'apps/web' },
        ]);
        send(app, 'Project', { _tag: 'BranchChosen', branch: 'feature' });
        expect(host(app).where).toMatchObject({ branch: null });
        send(app, 'Project', { _tag: 'BaseChosen', base: 'next' });
        expect(host(app).where).toMatchObject({ base: 'next' });
        send(app, 'Project', { _tag: 'BaseChosen', base: 'main' });
        expect(host(app).where).toMatchObject({ base: null });
      }),
    ));

  it('reads what the branch changed while Changes is on, and colours the tree', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({}, asked);
        yield* settle;
        expect(named(asked, 'changes')).toEqual([]);
        send(app, 'Project', { _tag: 'ChangesToggled' });
        yield* settle;
        expect(host(app).where).toMatchObject({ changes: true });
        expect(named(asked, 'changes')).toEqual([
          { root: '/repo', branch: null, base: 'main' },
        ]);
        expect(find(app, 'Tree')!.props).toMatchObject({
          changes: changeSet.files,
        });
        send(app, 'Project', { _tag: 'ChangesToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({ changes: null });
      }),
    ));

  it('reads no changes while the branch is the one compared to', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({ base: 'feature', changes: true }, asked);
        yield* settle;
        expect(named(asked, 'changes')).toEqual([]);
        expect(find(app, 'Tree')!.props).toMatchObject({ changes: null });
      }),
    ));

  it('opens a file beside the tree, as its diff once the branch changed it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ branch: 'next' });
        yield* settle;
        send(app, 'Tree', { _tag: 'Opened', path: 'docs/notes.md' });
        expect(find(app, 'Viewer')!.state).toMatchObject({ _tag: 'File' });
        expect(find(app, 'FileViewer')!.model).toEqual({
          root: '/repo',
          branch: 'next',
          path: 'docs/notes.md',
          base: null,
          status: null,
          inside: false,
        });
        send(app, 'FileViewer', { _tag: 'Closed' });
        expect(find(app, 'Viewer')).toBeUndefined();

        send(app, 'Project', { _tag: 'ChangesToggled' });
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

  it('says why a project cannot be opened, in a sentence, and reads it again when asked', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        let tries = 0;
        const app = yield* start({}, asked, {
          analyse: (at) =>
            tries++ === 0
              ? Effect.fail(
                  new ProjectsProblem({
                    reason: 'missing',
                    message: '~/repo does not exist.',
                  }),
                )
              : service(asked).analyse(at),
        });
        yield* settle;
        expect(project(app).state).toMatchObject({
          _tag: 'Failure',
          problem: '~/repo does not exist.',
          missing: true,
        });
        send(app, 'Project', { _tag: 'Retried' });
        yield* settle;
        expect(project(app).state).toMatchObject({ _tag: 'Monorepo' });
        // The branches were read again with it.
        expect(named(asked, 'branches')).toHaveLength(2);
        send(app, 'Project', { _tag: 'SwitchAsked' });
        expect(host(app).switched).toBe(1);
      }),
    ));

  it('views a folder: what changed in it while Changes is on, every file else; one of file and folder at a time', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ package: 'apps/web' });
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
        expect(find(app, 'Viewer')!.model).toEqual({
          root: '/repo',
          branch: null,
        });
        expect(find(app, 'Viewer')!.state).toMatchObject({
          _tag: 'Folder',
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

        send(app, 'Project', { _tag: 'ChangesToggled' });
        yield* settle;
        expect(find(app, 'Viewer')!.state).toMatchObject({
          base: 'main',
          changed: [{ path: 'apps/web/src/index.ts', status: 'modified' }],
        });
        // The first changed file, though an unchanged one comes first.
        expect(find(app, 'FileViewer')!.model).toMatchObject({
          path: 'apps/web/src/index.ts',
        });

        send(app, 'Tree', { _tag: 'Opened', path: 'apps/web/README.md' });
        expect(find(app, 'Viewer')!.state).toMatchObject({ _tag: 'File' });
        expect(find(app, 'FileViewer')!.model).toMatchObject({
          path: 'apps/web/README.md',
        });
      }),
    ));

  it("views a Package's changes from the Monorepo's tree, turning Changes on", () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start({}, asked);
        yield* settle;
        send(app, 'Tree', { _tag: 'Viewed', path: 'apps/web', files: [] });
        // Changes turns on, in the Monorepo's tree still.
        expect(host(app).where).toMatchObject({ package: null, changes: true });
        yield* settle;
        expect(named(asked, 'changes')).toHaveLength(1);
        expect(find(app, 'Viewer')!.state).toMatchObject({
          path: 'apps/web',
          base: 'main',
          changed: [{ path: 'apps/web/src/index.ts', status: 'modified' }],
        });
        // Changes off again: the folder stays open, all of it listed.
        app.root.send({ _tag: 'Go', where: where() });
        yield* settle;
        expect(find(app, 'Viewer')!.state).toMatchObject({
          path: 'apps/web',
          base: null,
          changed: [],
        });
      }),
    ));

  it("views the repository's root by the project's name", () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ changes: true });
        yield* settle;
        send(app, 'Tree', { _tag: 'Viewed', path: '', files: [] });
        yield* settle;
        expect(find(app, 'Viewer')!.state).toMatchObject({
          title: 'repo',
          changed: changeSet.files,
        });
        send(app, 'Viewer', { _tag: 'Closed' });
        expect(find(app, 'Viewer')).toBeUndefined();
      }),
    ));

  it('closes what is open in a Package once the host names another, and keeps it closed', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ package: 'apps/web' });
        yield* settle;
        send(app, 'Tree', { _tag: 'Opened', path: 'docs/notes.md' });
        expect(find(app, 'Viewer')).toBeDefined();
        // Back, to the Monorepo's tree.
        app.root.send({ _tag: 'Go', where: where() });
        expect(find(app, 'Viewer')).toBeUndefined();
        yield* settle;
        // Forward, to the Package again.
        app.root.send({ _tag: 'Go', where: where({ package: 'apps/web' }) });
        yield* settle;
        expect(find(app, 'Viewer')).toBeUndefined();
        expect(project(app).model).toMatchObject({ open: null });
      }),
    ));

  it("draws a folder looked into by the tree's settings, and changes them for both", () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ changes: true });
        yield* settle;
        send(app, 'Tree', { _tag: 'Viewed', path: '', files: [] });
        yield* settle;
        expect(find(app, 'Viewer')!.props).toEqual({
          unchanged: 'dim',
          deleted: true,
          ignored: true,
        });
        send(app, 'Viewer', {
          _tag: 'UnchangedChosen',
          unchanged: 'hide',
        });
        send(app, 'Viewer', { _tag: 'IgnoredToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({
          unchanged: 'hide',
          ignored: false,
        });
        expect(find(app, 'Viewer')!.props).toMatchObject({
          unchanged: 'hide',
          ignored: false,
        });
      }),
    ));

  it('leaves out the deleted files, from the tree and a folder looked into alike', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ changes: true });
        yield* settle;
        send(app, 'Project', { _tag: 'DeletedToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({
          changes: [changeSet.files[0]],
        });

        // Looked into, the folder starts without them, and brings them back.
        send(app, 'Tree', { _tag: 'Viewed', path: '', files: [] });
        yield* settle;
        expect(find(app, 'Viewer')!.state).toMatchObject({
          changed: changeSet.files,
        });
        expect(find(app, 'Viewer')!.props).toMatchObject({
          deleted: false,
        });
        send(app, 'Viewer', { _tag: 'DeletedToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({
          changes: changeSet.files,
        });
        expect(find(app, 'Viewer')!.props).toMatchObject({
          deleted: true,
        });
      }),
    ));

  it('draws what the branch left unchanged faded, to start with, or as chosen', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ changes: true });
        yield* settle;
        expect(find(app, 'Tree')!.props).toMatchObject({ unchanged: 'dim' });
        send(app, 'Project', { _tag: 'UnchangedChosen', unchanged: 'hide' });
        expect(find(app, 'Tree')!.props).toMatchObject({ unchanged: 'hide' });
      }),
    ));

  it("draws a Package's ignored files to start with, and leaves them out once asked, in it too", () =>
    run(
      Effect.gen(function* () {
        const app = yield* start({ package: 'apps/web' });
        yield* settle;
        expect(find(app, 'Tree')!.props).toMatchObject({ ignored: true });
        send(app, 'Project', { _tag: 'IgnoredToggled' });
        expect(find(app, 'Tree')!.props).toMatchObject({ ignored: false });
      }),
    ));
});
