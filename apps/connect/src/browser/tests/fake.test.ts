import {
  Context,
  Effect,
  Fiber,
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
import {
  type FakeHarness,
  makeFakeHarness,
} from '@kestack/ai-toolkit/harness/fake';
import {
  addressOf,
  CloudClient,
  isOutdated,
} from '../../cloud/client/index.js';
import {
  CodeClient,
  CodeClients,
  ConnectionAddress,
  type LinkStatus,
  pluginPath,
} from '../../connection/plugins/code/api/index.js';
import { computers } from '../fake/index.js';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import {
  ANOTHER_RELEASE,
  inTab,
  type Tables,
  tunnelClients,
} from '../index.js';
import { agentEdges } from './agent.js';

/*
 * The Computers Fake under the real Connect in a tab: each Control lands
 * where Code would see it, through Connect Cloud's list and each computer's
 * socket, dialled as Code dials it. A computer added is listed Ready, and
 * its File System's Controls reach its own Folders; offline it is Down at
 * once and its socket drops; below the Minimum Connect it stops until
 * updated; another Release closes its socket; Connect Cloud out of reach
 * fails every call; another device renames, starts and settles a Session,
 * and forgets a computer. Over kept tables and the kept Snapshot, as a
 * reload in fake mode, the world comes back as it was.
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
  harness?: FakeHarness,
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
      Layer.provide(Layer.merge(computers.serve(fake), agentEdges(harness))),
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
    const add = (name: string, keConnectVersion = '') =>
      fake.root.send({
        _tag: 'AddComputer',
        name,
        keConnectVersion,
        signedInAs: EMAIL,
      });
    return { fake, cloud, clients, on, computer, listed, add };
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

    it('takes a computer offline Down at once, its socket dropped, and brings it back, counting its sockets', () =>
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
          yield* eventually(() =>
            expect(computer('computer-1').model.sockets).toBe(1),
          );

          computer('computer-1').send({ _tag: 'GoOffline', downAtOnce: true });
          yield* eventually(() => expect(links.at(-1)).toBe('relinking'));
          yield* eventually(() =>
            expect(computer('computer-1').model.sockets).toBe(0),
          );
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

    it('lists its tunnel as each Control leaves it, and its key as it rotates', () =>
      run(
        Effect.gen(function* () {
          const { computer, listed, add } = yield* world();
          add('laptop');
          const laptop = computer('computer-1');
          const status = async () => (await listed())[0]?.status;

          laptop.send({
            _tag: 'DownloadCloudflared',
            megabytes: 12.5,
            seconds: 3,
          });
          yield* eventually(async () =>
            expect(await status()).toEqual({
              _tag: 'SettingUp',
              step: {
                _tag: 'Downloading',
                received: 12_500_000,
                elapsed: 3000,
              },
            }),
          );
          laptop.send({ _tag: 'FailTunnel', problem: 'no network' });
          yield* eventually(async () =>
            expect(await status()).toMatchObject({
              step: { _tag: 'Failed', problem: 'no network' },
            }),
          );
          laptop.send({ _tag: 'TunnelUnreachable', problem: 'timed out' });
          yield* eventually(async () =>
            expect(await status()).toMatchObject({
              _tag: 'Ready',
              check: { _tag: 'Unreachable', problem: 'timed out' },
            }),
          );
          laptop.send({ _tag: 'MoveTunnel' });
          yield* eventually(async () =>
            expect(await status()).toMatchObject({
              url: 'https://computer-1-1.computers.fake',
              check: { _tag: 'Reachable' },
            }),
          );

          const before = (yield* Effect.promise(listed))[0]?.key;
          laptop.send({ _tag: 'RotateKey' });
          yield* eventually(async () =>
            expect((await listed())[0]?.key).not.toBe(before),
          );
        }),
      ));

    it('stops a computer below the Minimum Connect, Outdated, until its ke-connect is updated', () =>
      run(
        Effect.gen(function* () {
          const { fake, computer, listed, add } = yield* world();
          add('laptop', '0.5.0');
          yield* eventually(async () => expect(await listed()).toHaveLength(1));

          fake.root.send({ _tag: 'SetMinimumConnect', version: '0.9.0' });
          yield* eventually(async () =>
            expect((await listed())[0]?.minConnect).toBe('0.9.0'),
          );
          // Its next Report, sent at once on a change, is refused.
          computer('computer-1').send({ _tag: 'RotateKey' });
          yield* eventually(() =>
            expect(computer('computer-1').model.stopped).toMatchObject({
              _tag: 'Outdated',
            }),
          );
          expect(isOutdated((yield* Effect.promise(listed))[0]!)).toBe(true);

          computer('computer-1').send({
            _tag: 'UpdateKeConnect',
            version: '0.9.1',
          });
          yield* eventually(async () => {
            const [laptop] = await listed();
            expect(laptop?.version).toBe('0.9.1');
            expect(isOutdated(laptop!)).toBe(false);
          });
          expect(computer('computer-1').model.stopped).toBeNull();
        }),
      ));

    it('closes the socket of a computer on another Release; Connect Cloud names another, and a reload keeps neither', () =>
      run(
        Effect.gen(function* () {
          const { fake, cloud, clients, on, computer, add } = yield* world();
          add('laptop');
          computer('computer-1').send({ _tag: 'RunAnotherRelease' });
          const mismatch = yield* Effect.forkScoped(
            clients.mismatch('computer-1').pipe(
              Stream.filter((each) => each !== null),
              Stream.runHead,
            ),
          );
          const answered = yield* Effect.forkScoped(
            on('computer-1', folders('~')),
          );
          expect(yield* Fiber.join(mismatch)).toEqual(
            Option.some({ running: ANOTHER_RELEASE }),
          );
          computer('computer-1').send({ _tag: 'RunTheNamedRelease' });
          expect(yield* Fiber.join(answered)).toEqual([]);

          const standing = () =>
            Effect.runPromise(
              Effect.orDie(cloud.Standing({ plugin: 'code', hash: RELEASE })),
            );
          expect(yield* Effect.promise(standing)).toEqual({ _tag: 'Latest' });
          fake.root.send({ _tag: 'CloudNamesANewerRelease' });
          yield* eventually(async () =>
            expect(await standing()).toEqual({ _tag: 'Older' }),
          );
          fake.root.send({ _tag: 'CloudNamesAnOlderRelease' });
          yield* eventually(async () =>
            expect(await standing()).toEqual({ _tag: 'Unknown' }),
          );

          computer('computer-1').send({ _tag: 'RunAnotherRelease' });
          const kept = computers.kept(fake.snapshot);
          expect(kept.root.model.untilReload).toEqual({
            cloudRelease: 'TheApps',
          });
          expect(kept.root.children.computers[0]?.model.untilReload).toEqual({
            runsAnotherRelease: false,
          });
          expect(fake.root.model.untilReload.cloudRelease).toBe('Older');
        }),
      ));

    it('keeps a watch going across a restart, its socket dropped before its code Plugin stops', () =>
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
          yield* eventually(() => expect(states).toEqual(['Off']));

          computer('computer-1').send({ _tag: 'Restart' });
          // Subscribed again once the socket is back: Off once more.
          yield* eventually(() => expect(states).toEqual(['Off', 'Off']));
          yield* on(
            'computer-1',
            Effect.flatMap(CodeClient, (api) => api.enableSpeechToText()),
          );
          yield* eventually(() => expect(states).toContain('Ready'));
        }),
      ));

    it('drops the socket of a linked computer that comes to run another Release, and links once it runs the named one', () =>
      run(
        Effect.gen(function* () {
          const { clients, on, computer, add } = yield* world();
          add('laptop');
          const links: Array<LinkStatus> = [];
          yield* Effect.forkScoped(
            Stream.runForEach(CodeClients.link('computer-1'), (now) =>
              Effect.sync(() => void links.push(now)),
            ).pipe(Effect.provideService(CodeClients, clients)),
          );
          yield* on('computer-1', folders('~'));
          yield* eventually(() => expect(links.at(-1)).toBe('linked'));

          const mismatch = yield* Effect.forkScoped(
            clients.mismatch('computer-1').pipe(
              Stream.filter((each) => each !== null),
              Stream.runHead,
            ),
          );
          computer('computer-1').send({ _tag: 'RunAnotherRelease' });
          expect(yield* Fiber.join(mismatch)).toEqual(
            Option.some({ running: ANOTHER_RELEASE }),
          );
          expect(links.at(-1)).not.toBe('linked');

          computer('computer-1').send({ _tag: 'RunTheNamedRelease' });
          yield* eventually(() => expect(links.at(-1)).toBe('linked'));
        }),
      ));

    it('fails every call while Connect Cloud is out of reach, and answers once it is back', () =>
      run(
        Effect.gen(function* () {
          const { fake, cloud } = yield* world();
          fake.root.send({ _tag: 'PutCloudOutOfReach' });
          yield* eventually(async () => {
            const failed = await Effect.runPromise(Effect.flip(cloud.List({})));
            // As a fetch that never got there fails.
            expect(failed).toMatchObject({
              _tag: 'RpcClientError',
              reason: { _tag: 'HttpError', kind: 'TransportError' },
            });
          });
          fake.root.send({ _tag: 'BringCloudBack' });
          yield* eventually(async () =>
            expect(await Effect.runPromise(cloud.List({}))).toEqual([]),
          );
        }),
      ));

    it('has another device rename a computer, start and settle a Session on it, and forget it', () =>
      run(
        Effect.gen(function* () {
          const { on, computer, listed, add } = yield* world();
          add('laptop');
          const laptop = computer('computer-1');
          laptop.children.fileSystem.send({
            _tag: 'AddSampleProject',
            folder: '~/code/shop',
          });

          yield* eventually(async () => expect(await listed()).toHaveLength(1));

          laptop.send({ _tag: 'RenameElsewhere', displayName: 'Work' });
          yield* eventually(async () =>
            expect((await listed())[0]?.displayName).toBe('Work'),
          );
          expect(laptop.model.saidElsewhere).toBe('Renamed it Work');

          laptop.send({
            _tag: 'StartSessionElsewhere',
            project: '~/code/shop',
            text: 'from my phone',
          });
          yield* eventually(() =>
            expect(laptop.model.saidElsewhere).toMatch(/^Started Session /),
          );
          const session = laptop.model.saidElsewhere!.split(' ').at(-1)!;
          const settledAt = Effect.flatMap(CodeClient, (api) =>
            api.sessions({ after: null }).pipe(
              Stream.flattenIterable,
              // Sent encoded: the fields read here are as stored.
              Stream.map(
                ({ value }) =>
                  value as { readonly id: string; readonly settledAt: unknown },
              ),
              Stream.filter(({ id }) => id === session),
              Stream.runHead,
              Effect.map((found) =>
                Option.map(found, ({ settledAt }) => settledAt),
              ),
            ),
          );
          expect(yield* on('computer-1', settledAt)).toEqual(Option.some(null));

          laptop.send({ _tag: 'SettleSessionElsewhere', session });
          yield* eventually(() =>
            expect(laptop.model.saidElsewhere).toBe(
              `Settled Session ${session}`,
            ),
          );
          const settled = yield* on('computer-1', settledAt);
          expect(Option.getOrNull(settled)).toEqual(expect.any(Number));

          laptop.send({ _tag: 'ForgetElsewhere' });
          yield* eventually(async () => expect(await listed()).toEqual([]));
          // Its next Report is refused: it stops, forgotten.
          laptop.send({ _tag: 'RotateKey' });
          yield* eventually(() =>
            expect(laptop.model.stopped).toEqual({ _tag: 'Forgotten' }),
          );
          expect(laptop.model.elsewhere).toEqual([]);
        }),
      ));

    it('has another device answer the question a Session waits on, each part with its first choice', () => {
      const harness = makeFakeHarness({ hold: true });
      return run(
        Effect.gen(function* () {
          const { on, computer, listed, add } = yield* world(harness);
          add('laptop');
          const laptop = computer('computer-1');
          laptop.children.fileSystem.send({
            _tag: 'AddSampleProject',
            folder: '~/code/shop',
          });
          yield* eventually(async () => expect(await listed()).toHaveLength(1));
          laptop.send({
            _tag: 'StartSessionElsewhere',
            project: '~/code/shop',
            text: 'ask me',
          });
          yield* eventually(() =>
            expect(laptop.model.saidElsewhere).toMatch(/^Started Session /),
          );
          const session = laptop.model.saidElsewhere!.split(' ').at(-1)!;

          yield* harness.askQuestion('native-1', {
            id: 'q1',
            items: [
              {
                id: 'auth',
                header: 'Auth method',
                question: 'How should users sign in?',
                options: [
                  { label: 'OAuth', description: '' },
                  { label: 'Password', description: '' },
                ],
                multiSelect: false,
                other: true,
                secret: false,
              },
            ],
            askedAt: 1,
          });
          const waiting = Effect.flatMap(CodeClient, (api) =>
            Stream.runHead(api.agentQuestions()),
          );
          yield* on('computer-1', waiting).pipe(
            Effect.repeat({
              until: (now) => Option.getOrElse(now, () => []).length > 0,
              schedule: Schedule.spaced('20 millis'),
            }),
          );

          laptop.send({ _tag: 'AnswerQuestionElsewhere', session });
          yield* eventually(() =>
            expect(laptop.model.saidElsewhere).toBe('Answered its question'),
          );
          expect(harness.answers).toEqual([
            { id: 'q1', answer: { auth: ['OAuth'] } },
          ]);
          yield* harness.finish;
        }),
      );
    });

    it('forgets a computer whose ke-connect is removed, and drops one removed', () =>
      run(
        Effect.gen(function* () {
          const { fake, computer, listed, add } = yield* world();
          add('laptop');
          add('desktop');
          yield* eventually(async () => expect(await listed()).toHaveLength(2));
          computer('computer-1').send({ _tag: 'ForgetItself' });
          yield* eventually(async () =>
            expect((await listed()).map(({ id }) => id)).toEqual([
              'computer-2',
            ]),
          );
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
          const { fake, on, computer, listed, add } = yield* world(undefined, {
            tables,
          });
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
          computer('computer-1').send({ _tag: 'RotateKey' });
          computer('computer-2').send({ _tag: 'GoOffline', downAtOnce: true });
          yield* eventually(async () => {
            const [laptop, desktop] = await listed();
            expect(laptop!.key).toBe('fake-key-computer-1-1');
            expect(Date.now() - desktop!.lastSeen).toBeGreaterThan(DOWN_AFTER);
          });
          yield* eventually(() =>
            expect(computer('computer-1').model.sockets).toBe(1),
          );
          const snapshot = computers.kept(fake.snapshot);
          // A reload closes every socket.
          expect(snapshot.root.children.computers[0]!.model.sockets).toBe(0);
          return {
            snapshot,
            listed: yield* Effect.promise(listed),
            project: project.id,
          };
        }),
      );
      // The reload takes a moment: a desktop pushed back again would be later.
      await new Promise((resolve) => setTimeout(resolve, 50));
      await run(
        Effect.gen(function* () {
          const { on, listed } = yield* world(undefined, {
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
          expect(wasLaptop!.key).toBe('fake-key-computer-1-1');
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
