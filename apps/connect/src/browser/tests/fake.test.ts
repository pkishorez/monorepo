import {
  Context,
  Effect,
  Layer,
  Option,
  Schedule,
  type Scope,
  Stream,
} from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { Runtime, type Snapshot } from '@kestack/kabuki';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { Accounts } from '@kestack/auth-toolkit/client';
import { fakeAccounts } from '@kestack/auth-toolkit/fake';
import { addressOf, CloudClient } from '../../cloud/client/index.js';
import {
  CodeClient,
  CodeClients,
  ConnectionAddress,
  type LinkStatus,
  pluginPath,
} from '../../connection/plugins/code/api/index.js';
import { computers } from '../fake/index.js';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import { inTab, type Tables, tunnelClients } from '../index.js';
import { agentEdges } from './agent.js';

/*
 * The Computers Fake under the real Connect in a tab: each Control lands
 * where Code would see it, through Connect Cloud's list and each computer's
 * socket, dialled as Code dials it. A computer added is listed Ready, and
 * its File System's Controls reach its own Folders; offline it is Down at
 * once and its socket drops, and back it links again; removed, it is gone.
 * Over kept tables and the Snapshot, as a reload in fake mode, the world
 * comes back as it was.
 */

const RELEASE = 'a'.repeat(64);
const WANTED = {
  code: {
    hash: RELEASE,
    url: `https://connect.fake/releases/code/${RELEASE}.mjs`,
  },
};
const EMAIL = 'ada@kestack.test';

/** Down: no Report for three Heartbeats of 15 seconds, as Code reads a Connection. */
const DOWN_AFTER = 45_000;

type Fake = Runtime<typeof computers.actor>;

/** The Computers Fake, and Code's side over Connect in the tab: Connect Cloud's client, signed in as Ada, and each Connection's socket at the address it is listed at. */
const world = (
  kept: {
    readonly tables?: Tables;
    readonly snapshot?: Snapshot<typeof computers.actor>;
  } = {},
) =>
  Effect.gen(function* () {
    const fake: Fake = yield* Runtime.scoped(
      computers.actor,
      (kept.snapshot ? { snapshot: kept.snapshot } : {}) as never,
    );
    const accounts = fakeAccounts({ choose: Effect.succeed({ email: EMAIL }) });
    const middle = inTab({
      wanted: WANTED,
      minConnect: '0.0.4',
      tables: kept.tables,
    }).pipe(
      Layer.provide(Layer.merge(computers.serve(fake), agentEdges())),
      Layer.provideMerge(accounts),
    );
    const built = yield* Layer.build(middle);
    yield* Effect.flatMap(Accounts, (each) => each.signIn()).pipe(
      Effect.provideContext(built),
    );
    const cloud = Context.get(built, CloudClient);
    const address = Layer.succeed(ConnectionAddress, {
      of: (connectionId) =>
        Effect.orDie(cloud.List({})).pipe(
          Effect.flatMap((listed) => {
            const found = listed.find(({ id }) => id === connectionId);
            const tunnel = found === undefined ? null : addressOf(found.status);
            return tunnel === null
              ? Effect.fail('not listed yet')
              : Effect.succeed({
                  url: `${tunnel}${pluginPath('code', RELEASE)}`,
                  key: found!.key,
                });
          }),
          Effect.retry(Schedule.spaced('20 millis')),
          Effect.orDie,
        ),
    });
    const clients = Context.get(
      yield* Layer.build(
        tunnelClients.pipe(
          Layer.provide(address),
          Layer.provide(Layer.succeedContext(built)),
        ),
      ),
      CodeClients,
    );
    const on = <A, E>(id: string, effect: Effect.Effect<A, E, CodeClient>) =>
      CodeClients.on(id, effect).pipe(
        Effect.provideService(CodeClients, clients),
      );
    /** The live computer `id`. */
    const computer = (id: string) => {
      const found = fake.root.children.computers.find(({ key }) => key === id);
      if (found === undefined) throw new Error(`no computer ${id}`);
      return found;
    };
    /** Connect Cloud's list now, as Code reads it. */
    const listed = () => Effect.runPromise(Effect.orDie(cloud.List({})));
    /** Adds a computer, as the bubble does. */
    const add = (name: string) =>
      fake.root.send({
        _tag: 'AddComputer',
        name,
        keConnectVersion: '',
        signedInAs: EMAIL,
      });
    return { fake, clients, on, computer, listed, add };
  });

const eventually = (assertion: () => Promise<void> | void) =>
  Effect.promise(() =>
    vi.waitFor(assertion, { timeout: 10_000, interval: 20 }),
  );

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

/** The folders in a folder of the computer's, by name. */
const folders = (path = '~/code') =>
  Effect.flatMap(CodeClient, (api) =>
    Effect.map(api.listFolder({ path }), ({ folders }) =>
      folders.map(({ name }) => name),
    ),
  );

describe(
  'the Computers Fake under Connect in a tab',
  { timeout: 20_000 },
  () => {
    it('lists a computer added Ready; its File System Controls reach its own Folders', () =>
      run(
        Effect.gen(function* () {
          const { on, computer, listed, add } = yield* world();
          add('laptop');
          add('desktop');
          yield* eventually(async () => {
            expect(await listed()).toMatchObject([
              {
                id: 'computer-1',
                name: 'laptop',
                version: '1.0.0',
                status: {
                  _tag: 'Ready',
                  url: 'https://computer-1.computers.fake',
                  check: { _tag: 'Reachable' },
                },
              },
              { id: 'computer-2', name: 'desktop' },
            ]);
          });

          computer('computer-1').children.fileSystem.send({
            _tag: 'AddSampleProject',
            folder: '~/code/shop',
          });
          computer('computer-2').children.fileSystem.send({
            _tag: 'AddFolder',
            folder: '~/code/blog',
          });
          expect(yield* on('computer-1', folders())).toEqual(['shop']);
          expect(yield* on('computer-2', folders())).toEqual(['blog']);
        }),
      ));

    it('takes a computer offline Down at once, its socket dropped, and brings it back', () =>
      run(
        Effect.gen(function* () {
          const { clients, on, computer, listed, add } = yield* world();
          add('laptop');
          const links: Array<LinkStatus> = [];
          yield* Effect.forkScoped(
            Stream.runForEach(CodeClients.link('computer-1'), (now) =>
              Effect.sync(() => void links.push(now)),
            ).pipe(Effect.provideService(CodeClients, clients)),
          );
          yield* on('computer-1', folders('~'));
          yield* eventually(() => expect(links.at(-1)).toBe('linked'));

          computer('computer-1').send({ _tag: 'GoOffline', downAtOnce: true });
          yield* eventually(() => expect(links.at(-1)).toBe('relinking'));
          yield* eventually(async () => {
            const [laptop] = await listed();
            expect(Date.now() - laptop!.lastSeen).toBeGreaterThan(DOWN_AFTER);
          });

          computer('computer-1').send({ _tag: 'ComeOnline' });
          yield* eventually(() => expect(links.at(-1)).toBe('linked'));
          yield* eventually(async () => {
            const [laptop] = await listed();
            expect(Date.now() - laptop!.lastSeen).toBeLessThan(DOWN_AFTER);
          });
        }),
      ));

    it('keeps a watch going offline and back, its socket dropped before its code Plugin stops', () =>
      run(
        Effect.gen(function* () {
          const { clients, on, computer, add } = yield* world();
          add('laptop');
          const states: Array<string> = [];
          // As Code watches: subscribed again each time the socket connects.
          yield* Effect.forkScoped(
            Stream.runForEach(
              CodeClients.stream(
                'computer-1',
                keepSubscribed(() =>
                  Stream.unwrap(
                    Effect.map(CodeClient, (api) => api.watchSpeechToText()),
                  ),
                ),
              ),
              (state) => Effect.sync(() => void states.push(state._tag)),
            ).pipe(Effect.provideService(CodeClients, clients)),
          );
          const links: Array<LinkStatus> = [];
          yield* Effect.forkScoped(
            Stream.runForEach(CodeClients.link('computer-1'), (now) =>
              Effect.sync(() => void links.push(now)),
            ).pipe(Effect.provideService(CodeClients, clients)),
          );
          yield* eventually(() => expect(states).toEqual(['Off']));

          computer('computer-1').send({ _tag: 'GoOffline', downAtOnce: false });
          yield* eventually(() => expect(links.at(-1)).toBe('relinking'));
          computer('computer-1').send({ _tag: 'ComeOnline' });
          // Subscribed again once the socket is back: Off once more.
          yield* eventually(() => expect(states).toEqual(['Off', 'Off']));
          yield* on(
            'computer-1',
            Effect.flatMap(CodeClient, (api) => api.enableSpeechToText()),
          );
          yield* eventually(() => expect(states).toContain('Ready'));
        }),
      ));

    it('drops a computer removed, and never gives its id again', () =>
      run(
        Effect.gen(function* () {
          const { fake, computer, listed, add } = yield* world();
          add('laptop');
          add('desktop');
          yield* eventually(async () => expect(await listed()).toHaveLength(2));
          computer('computer-2').send({ _tag: 'Remove' });
          expect(fake.root.model.computers.map(({ id }) => id)).toEqual([
            'computer-1',
          ]);
          add('server');
          expect(fake.root.model.computers.map(({ id }) => id)).toEqual([
            'computer-1',
            'computer-3',
          ]);
        }),
      ));

    it('comes back as it was over the kept tables and Snapshot, as after a reload', async () => {
      // One Memory table per database, kept across both worlds, as IndexedDB keeps them.
      const made = new Map<string, unknown>();
      const tables: Tables = (table, database) => {
        if (!made.has(database)) made.set(database, Memory.make(table).layer);
        return made.get(database) as ReturnType<Tables>;
      };
      const before = await run(
        Effect.gen(function* () {
          const { fake, on, computer, listed, add } = yield* world({ tables });
          add('laptop');
          add('desktop');
          computer('computer-1').children.fileSystem.send({
            _tag: 'AddSampleProject',
            folder: '~/code/shop',
          });
          const project = yield* on(
            'computer-1',
            Effect.flatMap(CodeClient, (api) =>
              api.addProject({ path: '/home/you/code/shop' }),
            ),
          );
          computer('computer-2').send({ _tag: 'GoOffline', downAtOnce: true });
          yield* eventually(async () => {
            const [laptop, desktop] = await listed();
            expect(laptop!.key).toBe('fake-key-computer-1');
            expect(Date.now() - desktop!.lastSeen).toBeGreaterThan(DOWN_AFTER);
          });
          return {
            snapshot: fake.snapshot,
            listed: yield* Effect.promise(listed),
            project: project.id,
          };
        }),
      );
      // The reload takes a moment: a desktop pushed back again would be later.
      await new Promise((resolve) => setTimeout(resolve, 50));
      await run(
        Effect.gen(function* () {
          const { on, listed } = yield* world({
            tables,
            snapshot: before.snapshot,
          });
          // Its disk from the Snapshot: linked, so every computer is followed.
          expect(yield* on('computer-1', folders())).toEqual(['shop']);
          const [laptop, desktop] = yield* Effect.promise(listed);
          const [wasLaptop, wasDesktop] = before.listed;
          // Its tunnel checked again as the tab's ke-connect starts: a new `at`.
          expect(laptop).toMatchObject({
            key: wasLaptop!.key,
            status: {
              _tag: 'Ready',
              url: 'https://computer-1.computers.fake',
              check: { _tag: 'Reachable' },
            },
          });
          expect(wasLaptop!.key).toBe('fake-key-computer-1');
          expect(desktop).toEqual(wasDesktop);
          // Its Store from its table.
          const project = yield* on(
            'computer-1',
            Effect.flatMap(CodeClient, (api) =>
              api.projects({ after: null }).pipe(
                Stream.flattenIterable,
                Stream.map(({ value }) => value as { readonly id: string }),
                Stream.filter(({ id }) => id === before.project),
                Stream.runHead,
              ),
            ),
          );
          expect(Option.isSome(project)).toBe(true);
        }),
      );
    });
  },
);
