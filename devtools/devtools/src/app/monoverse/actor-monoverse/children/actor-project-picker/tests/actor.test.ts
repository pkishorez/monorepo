import { Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';
import {
  Projects,
  ProjectsProblem,
  type ProjectsService,
} from '../../../../services/projects/contract/index.js';
import type {
  Folder,
  FolderListing,
} from '../../../../server/rpc/folders/contract/index.js';
import {
  ProjectEntrySchema,
  type ProjectEntry,
} from '../../../../server/rpc/project-registry/contract/index.js';
import { ProjectPicker } from '../index.js';
import {
  OPEN_FOLDER,
  projectValue,
  shownOf,
  type Model,
} from '../logic/shared/index.js';

/*
 * The Project Picker in memory, on a Projects service that answers what
 * the test says, mounted by a host that keeps what it Emits: a recent
 * Project picked opens, the folders are walked from home and back, a typed
 * path goes there, a chosen folder is added and opens, a Project is removed.
 */

const Host = Actor.define('Host', {
  model: Schema.Struct({
    picked: Schema.Array(ProjectEntrySchema),
    dismissed: Schema.Finite,
  }),
  message: {
    Picked: { project: ProjectEntrySchema },
    Dismissed: {},
  },
});

const HostLive = Host.build({
  init: () => ({ model: { picked: [], dismissed: 0 } }),
  children: {
    picker: Actor.child(ProjectPicker, {
      input: () => ({ current: 'k' }),
      props: () => ({ current: 'k' }),
      emits: {
        Picked: ({ project }) => ({ _tag: 'Picked', project }),
        Dismissed: () => ({ _tag: 'Dismissed' }),
      },
    }),
  },
  on: {
    Picked: ({ project }, { model }) => ({
      model: { ...model, picked: [...model.picked, project] },
    }),
    Dismissed: (_, { model }) => ({
      model: { ...model, dismissed: model.dismissed + 1 },
    }),
  },
});

const HOME = '/home/me';

const project = (id: string, path: string): ProjectEntry => ({
  id,
  path,
  name: path.split('/').pop()!,
  addedAt: 1,
});

const folder = (
  parent: string,
  name: string,
  kind: Folder['kind'] = null,
): Folder => ({ name, path: `${parent}/${name}`, link: false, kind });

/** The folders under home, by folder. */
const disk: Record<string, ReadonlyArray<Folder>> = {
  [HOME]: [
    folder(HOME, 'code'),
    folder(HOME, 'notes'),
    folder(HOME, '.config'),
  ],
  [`${HOME}/code`]: [
    folder(`${HOME}/code`, 'kestack', 'monorepo'),
    folder(`${HOME}/code`, 'foo', 'package'),
    folder(`${HOME}/code`, 'food'),
    folder(`${HOME}/code`, 'bar'),
  ],
  [`${HOME}/code/foo`]: [],
};

type Asked = Array<{ readonly method: string; readonly payload: unknown }>;

const listFolders = ({
  path,
  query,
  hidden,
}: {
  path: string | null;
  query: string;
  hidden: boolean;
}) => {
  const at = path ?? HOME;
  const folders = disk[at];
  if (folders === undefined)
    return Effect.fail(
      new ProjectsProblem({ reason: 'failed', message: 'Not found' }),
    );
  const listing: FolderListing = {
    path: at,
    home: HOME,
    parent: at === HOME ? null : at.slice(0, at.lastIndexOf('/')),
    kind: at === `${HOME}/code/foo` ? 'package' : null,
    folders: folders.filter(
      ({ name }) =>
        (hidden || !name.startsWith('.')) &&
        name.toLowerCase().includes(query.toLowerCase()),
    ),
    truncated: false,
  };
  return Effect.succeed(listing);
};

/** The service as the test says: anything it does not say never answers. */
const server = (asked: Asked, projects: Array<ProjectEntry>) => {
  const answers: Record<
    string,
    (payload: never) => Effect.Effect<unknown, unknown>
  > = {
    projects: () => Effect.succeed([...projects]),
    addProject: ({ path }: { path: string }) =>
      Effect.succeed(project('new', path)),
    removeProject: ({ id }: { id: string }) => {
      const at = projects.findIndex((each) => each.id === id);
      if (at !== -1) projects.splice(at, 1);
      return Effect.succeed({ removed: at !== -1 });
    },
    listFolders,
  };
  return Layer.succeed(Projects)(
    new Proxy({} as ProjectsService, {
      get: (_, method: string) => (payload: never) => {
        asked.push({ method, payload });
        return answers[method]?.(payload) ?? Effect.never;
      },
    }),
  );
};

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const walkTree = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(
      walkTree,
    ),
  ),
];
type App = Runtime<typeof HostLive>;

const picker = (app: App) =>
  walkTree(app.snapshot.root).find(
    (each) => each.actor === 'ProjectPicker',
  ) as Instance & { model: Model };
const send = (
  app: App,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) =>
  // oxlint-disable-next-line typescript/no-explicit-any -- the Picker's Messages
  app.at(picker(app).address)!.send(message as any);
const shown = (app: App) => shownOf(picker(app).model, 'k');
const labels = (app: App) => shown(app).rows.map(({ label }) => label);
const host = (app: App) => app.snapshot.root.model;

const start = (asked: Asked = [], projects?: Array<ProjectEntry>) =>
  Runtime.scoped(HostLive, {
    input: undefined,
    layer: server(
      asked,
      projects ?? [
        project('k', `${HOME}/code/kestack`),
        project('n', `${HOME}/notes`),
      ],
    ),
  });

describe('ProjectPicker', () => {
  it('lists the saved Projects, and Emits the one picked', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start();
        yield* wait();
        expect(labels(app)).toEqual(['kestack', 'notes', 'Open a folder…']);
        expect(shown(app).rows[0]).toMatchObject({
          detail: '~/code/kestack',
          current: true,
        });
        send(app, { _tag: 'Typed', query: 'no' });
        expect(picker(app).model.highlighted).toBe(projectValue('n'));
        send(app, { _tag: 'Picked', value: projectValue('n') });
        expect(host(app).picked).toMatchObject([{ id: 'n' }]);
      }),
    ));

  it('walks folders from home and back, never above it', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start(asked);
        yield* wait();
        send(app, { _tag: 'Picked', value: OPEN_FOLDER });
        // Home was read ahead: no waiting for it.
        expect(labels(app)).toEqual(['code', 'notes']);
        send(app, { _tag: 'Picked', value: `${HOME}/code` });
        yield* wait();
        expect(shown(app).where).toMatchObject({
          crumbs: ['~', 'code'],
          path: `${HOME}/code`,
        });
        expect(labels(app)).toEqual(['kestack', 'foo', 'food', 'bar']);
        expect(asked).toContainEqual({
          method: 'listFolders',
          payload: { path: `${HOME}/code`, query: '', hidden: false },
        });
        send(app, { _tag: 'WentBack' });
        expect(shown(app).where?.crumbs).toEqual(['~']);
        send(app, { _tag: 'WentBack' });
        expect(shown(app).step).toBe('recent');
      }),
    ));

  it('goes to a typed path, searching what follows the last /', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start();
        yield* wait();
        send(app, { _tag: 'Typed', query: '~/code/fo' });
        // A path goes to a folder first, before the Project it names.
        expect(picker(app).model.highlighted).toBe(OPEN_FOLDER);
        send(app, { _tag: 'Picked', value: OPEN_FOLDER });
        yield* wait(250);
        const model = picker(app).model;
        expect(model.folders.map(({ segments }) => segments)).toEqual([
          [],
          ['code'],
        ]);
        expect(model.folders.at(-1)?.query).toBe('fo');
        expect(labels(app)).toEqual(['foo', 'food']);
        expect(model.folders.at(-1)?.highlighted).toBe(`${HOME}/code/foo`);
        // `..` goes back up.
        send(app, { _tag: 'Typed', query: '../no' });
        expect(
          picker(app).model.folders.map(({ segments }) => segments),
        ).toEqual([[]]);
        expect(labels(app)).toEqual(['notes']);
      }),
    ));

  it('lists hidden folders for a search starting with .', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start(asked);
        yield* wait();
        send(app, { _tag: 'Picked', value: OPEN_FOLDER });
        send(app, { _tag: 'Typed', query: '.co' });
        yield* wait(250);
        expect(asked).toContainEqual({
          method: 'listFolders',
          payload: { path: null, query: '.co', hidden: true },
        });
        expect(labels(app)).toEqual(['.config']);
      }),
    ));

  it('adds the folder chosen as a Project, then Emits it', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start(asked);
        yield* wait();
        send(app, { _tag: 'Typed', query: '~/code/' });
        send(app, { _tag: 'Picked', value: OPEN_FOLDER });
        yield* wait();
        // Mod+Enter on a row: that folder.
        send(app, { _tag: 'Chose', on: `${HOME}/code/foo` });
        yield* wait();
        expect(asked).toContainEqual({
          method: 'addProject',
          payload: { path: `${HOME}/code/foo` },
        });
        expect(host(app).picked).toMatchObject([
          { id: 'new', path: `${HOME}/code/foo` },
        ]);
        // "Open this folder": the folder open.
        send(app, { _tag: 'Chose', on: null });
        yield* wait();
        expect(host(app).picked.at(-1)).toMatchObject({
          path: `${HOME}/code`,
        });
      }),
    ));

  it('says why a folder cannot be read', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start();
        yield* wait();
        send(app, { _tag: 'Typed', query: '~/gone/' });
        send(app, { _tag: 'Picked', value: OPEN_FOLDER });
        yield* wait();
        expect(shown(app).problem).toBe('Not found');
        // A folder that cannot be read cannot be chosen.
        expect(shown(app).where?.path).toBeNull();
        send(app, { _tag: 'Chose', on: null });
        expect(picker(app).model.adding).toBeNull();
      }),
    ));

  it('removes a Project, keeping the highlight in place', () =>
    run(
      Effect.gen(function* () {
        const asked: Asked = [];
        const app = yield* start(asked);
        yield* wait();
        expect(picker(app).model.highlighted).toBe(projectValue('k'));
        send(app, { _tag: 'RemoveAsked', id: 'k' });
        expect(labels(app)).toEqual(['notes', 'Open a folder…']);
        expect(picker(app).model.highlighted).toBe(projectValue('n'));
        yield* wait();
        expect(asked).toContainEqual({
          method: 'removeProject',
          payload: { id: 'k' },
        });
        expect(picker(app).model.recent).toMatchObject([{ id: 'n' }]);
      }),
    ));

  it('Emits Dismissed when closed', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start();
        send(app, { _tag: 'Dismissed' });
        expect(host(app).dismissed).toBe(1);
      }),
    ));
});
