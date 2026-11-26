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
import { FakeWorld } from '@kestack/kabuki/fake';
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
import { computers, type ComputersState } from '../fake/index.js';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import { inTab, tunnelClients } from '../index.js';
import { agentEdges } from './agent.js';

/*
 * The Computers fake under the real Connect in a tab: each control lands
 * where Code would see it, through Connect Cloud's list and each computer's
 * socket, dialled as Code dials it. A computer added is listed Ready, and
 * what is put on its disk reaches its own Folders; offline it is Down at
 * once and its socket drops, and back it links again; removed, it is gone.
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

/** The Computers fake in a FakeWorld of its own, and Code's side over Connect in the tab: Connect Cloud's client, signed in as Ada, and each Connection's socket at the address it is listed at. */
const world = () =>
  Effect.gen(function* () {
    const fakes = FakeWorld.make([computers]);
    const accounts = fakeAccounts({ choose: Effect.succeed({ email: EMAIL }) });
    const middle = inTab({ wanted: WANTED, minConnect: '0.0.4' }).pipe(
      Layer.provide(Layer.merge(fakes.layer, agentEdges())),
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
    /** Runs one of the fake's controls, as DevTools does. */
    const control = (name: string, payload: object) =>
      Effect.orDie(fakes.control('computers', name, payload));
    /** The fake's state now. */
    const state = Effect.map(
      Stream.runHead(fakes.fakes),
      (now) => Option.getOrThrow(now)[0]!.value as ComputersState,
    );
    /** Connect Cloud's list now, as Code reads it. */
    const listed = () => Effect.runPromise(Effect.orDie(cloud.List({})));
    /** Adds a computer, signed in as Ada. */
    const add = (name: string) =>
      control('AddComputer', { name, keConnectVersion: '', signedInAs: EMAIL });
    return { fakes, clients, on, control, state, listed, add };
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
    it('lists a computer added Ready; what is put on its disk reaches its own Folders', () =>
      run(
        Effect.gen(function* () {
          const { on, control, listed, add } = yield* world();
          yield* add('laptop');
          yield* add('desktop');
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

          yield* control('AddSampleProject', {
            computer: 'computer-1',
            folder: '~/code/shop',
          });
          yield* control('AddFolder', {
            computer: 'computer-2',
            folder: '~/code/blog',
          });
          expect(yield* on('computer-1', folders())).toEqual(['shop']);
          expect(yield* on('computer-2', folders())).toEqual(['blog']);
        }),
      ));

    it('takes a computer offline Down at once, its socket dropped, and brings it back', () =>
      run(
        Effect.gen(function* () {
          const { clients, on, control, listed, add } = yield* world();
          yield* add('laptop');
          const links: Array<LinkStatus> = [];
          yield* Effect.forkScoped(
            Stream.runForEach(CodeClients.link('computer-1'), (now) =>
              Effect.sync(() => void links.push(now)),
            ).pipe(Effect.provideService(CodeClients, clients)),
          );
          yield* on('computer-1', folders('~'));
          yield* eventually(() => expect(links.at(-1)).toBe('linked'));

          yield* control('GoOffline', {
            computer: 'computer-1',
            downAtOnce: true,
          });
          yield* eventually(() => expect(links.at(-1)).toBe('relinking'));
          yield* eventually(async () => {
            const [laptop] = await listed();
            expect(Date.now() - laptop!.lastSeen).toBeGreaterThan(DOWN_AFTER);
          });

          yield* control('ComeOnline', { computer: 'computer-1' });
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
          const { clients, on, control, add } = yield* world();
          yield* add('laptop');
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

          yield* control('GoOffline', {
            computer: 'computer-1',
            downAtOnce: false,
          });
          yield* eventually(() => expect(links.at(-1)).toBe('relinking'));
          yield* control('ComeOnline', { computer: 'computer-1' });
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
          const { fakes, control, state, listed, add } = yield* world();
          yield* add('laptop');
          yield* add('desktop');
          yield* eventually(async () => expect(await listed()).toHaveLength(2));
          yield* control('Remove', { computer: 'computer-2' });
          const ids = () =>
            Effect.map(state, ({ computers }) => computers.map(({ id }) => id));
          expect(yield* ids()).toEqual(['computer-1']);
          yield* add('server');
          expect(yield* ids()).toEqual(['computer-1', 'computer-3']);
          expect(
            yield* Effect.flip(
              fakes.control('computers', 'Remove', { computer: 'computer-9' }),
            ),
          ).toBe('No computer is computer-9.');
        }),
      ));

    it('names a computer by its id or its name, the id first', () =>
      run(
        Effect.gen(function* () {
          const { control, state } = yield* world();
          yield* control('AddComputer', { name: 'computer-2' });
          yield* control('AddComputer', { name: 'studio' });
          yield* control('GoOffline', { computer: 'studio' });
          yield* control('GoOffline', { computer: 'computer-2' });
          const online = Effect.map(state, ({ computers }) =>
            computers.map(({ name, online }) => [name, online]),
          );
          expect(yield* online).toEqual([
            ['computer-2', true],
            ['studio', false],
          ]);
        }),
      ));
  },
);
