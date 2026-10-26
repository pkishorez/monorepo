import { Effect, Layer, Queue, Scope, Stream } from 'effect';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import {
  CodeClient,
  CodeClients,
  type HarnessInfo,
  SkillsUnavailable,
} from '@kestack/connect/code';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import {
  type Ask,
  DeviceState,
  Dictations,
  Kept,
  type Kit,
  Machines,
  nobody,
  nothing,
  SavedDrafts,
} from '../../../../layer/capabilities/index.ts';
import { keptMemory } from '../../../../layer/services/index.ts';
import { Catalog } from '../capabilities/index.ts';
import { StarterLive } from './actor.ts';

/*
 * The catalog a new session chooses from, as its keeper keeps it: the
 * agents and their models as the Machine's Kit holds them, and the Skills
 * kept for each project, all shown at once, with nothing loading, while
 * the Machine has not answered; the Skills it answers are kept for their
 * own project, and an agent whose Skills it refuses keeps what showed.
 */

const HARNESS: HarnessInfo = {
  account: 'claude',
  harness: 'claude',
  name: 'Claude',
  settings: [],
  defaultModel: 'opus',
  available: true,
  unavailableReason: null,
};

const KIT: Kit = {
  accounts: null,
  speech: null,
  harnesses: [HARNESS],
  models: [
    {
      account: 'claude',
      list: [{ id: 'opus', name: 'Opus', releaseDate: null }],
      problem: null,
    },
  ],
  savedRead: true,
  problem: null,
};

const skill = (name: string) => ({ name, description: name });
const skillsOf = (...names: ReadonlyArray<string>) => [
  { account: 'claude', list: names.map(skill), problem: null },
];

const where = (projectId: string) => ({
  accountId: 'a1',
  machineId: 'm1',
  projectId,
});

const OwnerLive = Actor.build(Actor.define('Owner', {}), {
  children: {
    p1: {
      actor: StarterLive,
      props: () => ({ machineId: 'm1', projectId: 'p1', path: '/p1' }),
    },
    p2: {
      actor: StarterLive,
      props: () => ({ machineId: 'm1', projectId: 'p2', path: '/p2' }),
    },
  },
});

type Api = CodeClient['Service'];

/** The Machine answers each project's Skills as the test says, else never. */
const services = (
  answers: Record<
    string,
    Effect.Effect<ReadonlyArray<ReturnType<typeof skill>>, SkillsUnavailable>
  >,
) =>
  Layer.mergeAll(
    CodeClients.make(() =>
      Layer.merge(
        // An RPC client's procedures are generic over how they are called;
        // a stand-in answers the one way the app calls them.
        Layer.mock(CodeClient)({
          skills: (({ projectId }: { readonly projectId: string }) =>
            answers[projectId] ?? Effect.never) as unknown as Api['skills'],
        }),
        Layer.mock(RpcConnection)({
          keepSubscribed: (subscribe) => subscribe(),
          hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
        }),
      ),
    ),
    Layer.mock(Machines)({
      kit: () => Stream.concat(Stream.make(KIT), Stream.never),
      current: Effect.succeed({ ...nobody, accountId: 'a1' }),
    }),
    Layer.mock(Navigation)({}),
    Layer.mock(SavedDrafts)({ read: () => Effect.succeed(null) }),
    Layer.mock(Accounts)({
      current: Effect.succeed(AccountsState.SignedOut()),
    }),
    Layer.effect(
      Dictations,
      Effect.map(Queue.unbounded<typeof Ask.Type>(), (asked) =>
        Dictations.of({ asked }),
      ),
    ),
    Layer.mock(DeviceState)({
      read: Effect.succeed(nothing),
      changes: Stream.never,
    }),
  );

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];

/** What the Draft of the project's new session was handed. */
const catalogOf = (app: Running<unknown>, projectId: string) => {
  const starter = walk(app.snapshot()).find(
    (each) =>
      each.actor === 'Starter' &&
      (each.props as { readonly projectId: string }).projectId === projectId,
  )!;
  const draft = walk(starter).find((each) => each.actor === 'Draft')!;
  return (draft.model as { readonly catalog: typeof Catalog.Model.Type })
    .catalog;
};

const run = (effect: Effect.Effect<void, unknown, Scope.Scope | Kept>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(keptMemory()),
    ) as Effect.Effect<void>,
  );

const start = (layer: Layer.Layer<any>) =>
  Effect.flatMap(Kept, (kept) =>
    Runtime.start(
      OwnerLive as never,
      Layer.merge(layer, Layer.succeed(Kept, kept)) as never,
    ),
  ) as Effect.Effect<Running<unknown>, never, Scope.Scope | Kept>;

describe('a new session’s catalog', () => {
  it('shows the Kit’s agents and models and each project’s kept Skills at once, nothing loading, while the Machine has not answered', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Kept;
        yield* kept.write(Catalog.SkillsShelf, where('p1'), skillsOf('review'));
        yield* kept.write(Catalog.SkillsShelf, where('p2'), skillsOf('deploy'));
        const app = yield* start(services({}));
        yield* wait();
        const p1 = catalogOf(app, 'p1');
        expect(p1.harnesses).toEqual([HARNESS]);
        expect(Catalog.modelsOf(p1, 'claude')?.list).toHaveLength(1);
        expect(
          Catalog.skillsOf(p1, 'claude')?.list.map(({ name }) => name),
        ).toEqual(['review']);
        expect(
          Catalog.skillsOf(catalogOf(app, 'p2'), 'claude')?.list.map(
            ({ name }) => name,
          ),
        ).toEqual(['deploy']);
      }),
    ));

  it('keeps the Skills the Machine answers for their own project, and what showed of an agent whose Skills it refuses', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Kept;
        yield* kept.write(Catalog.SkillsShelf, where('p2'), skillsOf('deploy'));
        const app = yield* start(
          services({
            p1: Effect.succeed([skill('review'), skill('test')]),
            p2: Effect.fail(new SkillsUnavailable({ message: 'busy' })),
          }),
        );
        yield* wait();
        expect(
          Catalog.skillsOf(catalogOf(app, 'p1'), 'claude')?.list.map(
            ({ name }) => name,
          ),
        ).toEqual(['review', 'test']);
        expect(
          (yield* kept.read(Catalog.SkillsShelf, where('p1')))?.[0]?.list.map(
            ({ name }) => name,
          ),
        ).toEqual(['review', 'test']);
        expect(Catalog.skillsOf(catalogOf(app, 'p2'), 'claude')).toEqual(
          skillsOf('deploy')[0],
        );
        expect(
          (yield* kept.read(Catalog.SkillsShelf, where('p2')))?.[0]?.list.map(
            ({ name }) => name,
          ),
        ).toEqual(['deploy']);
      }),
    ));
});
