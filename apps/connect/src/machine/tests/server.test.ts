import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from '@tanstack/db';
import { Actor, Runtime } from '@kestack/kabuki';
import { Query, Replicas } from '@kestack/std-toolkit/replica';
import { Store as ReplicaStore } from '@kestack/std-toolkit/replica/memory';
import {
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Schedule,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CodeReplica,
  CodeClient,
  CodeClients,
  CodeReplicaLive,
  connection,
  MachineAddress,
} from '../code/api/client/index.js';
import { FAKE_SKILLS, makeFakeHarness } from '@kestack/ai-toolkit/harness/fake';
import { makeFakeSpeech } from '@kestack/ai-toolkit/speech/fake';
import { codeGroup, type CodeGroupOptions } from '../code/index.js';
import { server as machineServer } from '../server/index.js';

/*
 * The whole stack: the Machine's socket serving the code App Group on a real port, an app with the real client
 * and Replica, a session whose messages arrive live, then the server
 * restarts and the app carries on from where its feed left off.
 */

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});
const folder = () => {
  const made = mkdtempSync(join(tmpdir(), 'ai-server-'));
  folders.push(made);
  return made;
};

/** The Machine's socket serving the code App Group alone, as `ke-connect serve` composes it. */
const server = ({
  port,
  key,
  origins,
  ...group
}: CodeGroupOptions & {
  readonly port: number;
  readonly key?: string;
  readonly origins?: ReadonlyArray<string>;
}) =>
  machineServer({
    port,
    key,
    ...(origins === undefined ? {} : { origins }),
    groups: [codeGroup(group)],
  });

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

/**
 * Stops a server. Effect's Node server, closed with a WebSocket still open,
 * ends the fiber that closes it with an interrupt once it has shut down; a
 * fiber of its own keeps the test's fiber out of it.
 */
const stop = (scope: Scope.Closeable) =>
  Effect.flatMap(Effect.forkDetach(Scope.close(scope, Exit.void)), Fiber.await);

const eventually = (assertion: () => void) =>
  Effect.promise(() =>
    vi.waitFor(assertion, { timeout: 10_000, interval: 20 }),
  );

const Projects = Query.make('Projects', {
  props: Schema.Struct({}),
  from: () => Effect.all({ ai: CodeReplica.get('test-machine') }),
  query:
    (_, { ai }) =>
    (q) =>
      q.from({ p: ai.projects }),
});

const Messages = Query.make('Messages', {
  props: Schema.Struct({ sessionId: Schema.String }),
  from: () => Effect.all({ ai: CodeReplica.get('test-machine') }),
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ m: ai.messages })
        .where(({ m }) => eq(m.sessionId, props.sessionId)),
});

const Page = Actor.build(
  Actor.define('Page', {
    model: Schema.Struct({ sessionId: Schema.NullOr(Schema.String) }),
    message: Schema.TaggedUnion({ Open: { sessionId: Schema.String } }),
  }),
  {
    init: () => ({ model: { sessionId: null } }),
    on: { Open: ({ sessionId }) => ({ model: { sessionId } }) },
    children: {
      projects: { actor: Projects, props: () => ({}) },
      messages: {
        actor: Messages,
        while: ({ model }) => model.sessionId !== null,
        props: ({ model }) => ({ sessionId: model.sessionId ?? '' }),
      },
    },
  },
);

const Root = Actor.build(Actor.define('Root', {}), {
  provides: () => Replicas.layer,
  children: {
    replicas: Replicas.child([CodeReplicaLive]),
    page: { actor: Page },
  },
});

/** One Machine's projects, by its id. */
const MachineProjects = Query.make('MachineProjects', {
  props: Schema.Struct({ machineId: Schema.String }),
  from: ({ props }) => Effect.all({ ai: CodeReplica.get(props.machineId) }),
  query:
    (_, { ai }) =>
    (q) =>
      q.from({ p: ai.projects }),
});

/** An app on two Machines at once, each Instance syncing on its own. */
const TwoMachines = Actor.build(Actor.define('TwoMachines', {}), {
  provides: () => Replicas.layer,
  children: {
    replicas: Replicas.child([CodeReplicaLive]),
    one: { actor: MachineProjects, props: () => ({ machineId: 'one' }) },
    two: { actor: MachineProjects, props: () => ({ machineId: 'two' }) },
  },
});

type Rows = ReadonlyArray<{
  readonly row: {
    readonly id: string;
    readonly parts: ReadonlyArray<{
      readonly type: string;
      readonly text?: string;
    }>;
  };
}>;

/** A message as one line: its first part, and its text if it has one. */
const line = ({ row }: Rows[number]) => {
  const part = row.parts[0]!;
  return part.text === undefined ? part.type : `${part.type} ${part.text}`;
};

/** How the server answers a WebSocket upgrade from `origin` at `path`: 101, or its refusal. */
const upgrade = (
  port: number,
  origin: string | undefined,
  protocols?: string,
  path = '/rpc',
) =>
  new Promise<number>((resolve, reject) => {
    const asking = request({
      host: '127.0.0.1',
      port,
      path,
      agent: false,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('0123456789abcdef').toString('base64'),
        ...(origin === undefined ? {} : { origin }),
        ...(protocols === undefined
          ? {}
          : { 'sec-websocket-protocol': protocols }),
      },
    });
    asking.on('upgrade', (_, socket) => {
      socket.destroy();
      resolve(101);
    });
    asking.on('response', (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    asking.on('error', reject);
    asking.end();
  });

/** A real WebSocket offering `protocols`: the subprotocol it opened with, or how it failed. */
const socket = (port: number, protocols: ReadonlyArray<string>) =>
  new Promise<string>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/rpc`, [...protocols]);
    ws.addEventListener('open', () => {
      resolve(`open:${ws.protocol}`);
      ws.close();
    });
    ws.addEventListener('error', () => resolve('error'));
  });

describe('the server, through the client and Replica', () => {
  it('asks for the Machine Key everywhere but /health, and selects ke-connect, never the key', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          const key = 'k3y_-secret';
          yield* Layer.build(
            server({
              port,
              db: join(folder(), 'ai.db'),
              harnesses: makeFakeHarness().layer,
              key,
            }),
          );
          const status = (origin: string | undefined, protocols?: string) =>
            Effect.promise(() => upgrade(port, origin, protocols));
          expect(yield* status(undefined)).toBe(401);
          expect(yield* status(undefined, 'ke-connect')).toBe(401);
          expect(yield* status(undefined, 'ke-connect, key.wrong')).toBe(403);
          expect(yield* status(undefined, `ke-connect, key.${key}`)).toBe(101);
          // The router answers other spellings of /rpc too; none skips the key.
          for (const path of [
            '/RPC',
            '//rpc',
            '/%72pc',
            '/Rpc/',
            'http://x/rpc',
          ])
            expect(
              yield* Effect.promise(() =>
                upgrade(port, undefined, 'ke-connect', path),
              ),
            ).toBe(401);
          expect(
            yield* status('https://code.kishore.app', `ke-connect, key.${key}`),
          ).toBe(101);
          expect(
            yield* status('https://evil.com', `ke-connect, key.${key}`),
          ).toBe(403);

          const open = (protocols: ReadonlyArray<string>) =>
            Effect.promise(() => socket(port, protocols));
          expect(yield* open(['ke-connect', `key.${key}`])).toBe(
            'open:ke-connect',
          );
          expect(yield* open(['ke-connect', 'key.wrong'])).toBe('error');
          expect(yield* open([])).toBe('error');

          const health = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${port}/health`),
          );
          expect(health.status).toBe(200);

          const client = yield* Layer.build(
            CodeClient.layer(`ws://127.0.0.1:${port}/rpc`, { key }),
          );
          const api = Context.get(client, CodeClient);
          expect(yield* api.harnesses()).toMatchObject([{ name: 'claude' }]);
        }),
      ),
    ));

  it('lets in only the origins it was given, and programs that send none', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          const db = join(folder(), 'ai.db');
          yield* Layer.build(
            server({
              port,
              db,
              harnesses: makeFakeHarness().layer,
              origins: ['http://localhost:*', 'https://*.app.test'],
            }),
          );
          const status = (origin: string | undefined) =>
            Effect.promise(() => upgrade(port, origin));
          expect(yield* status(undefined)).toBe(101);
          expect(yield* status('http://localhost:5173')).toBe(101);
          expect(yield* status('https://dev.app.test')).toBe(101);
          expect(yield* status('https://app.test.evil.com')).toBe(403);
          expect(yield* status('https://evil.com')).toBe(403);
          const health = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${port}/health`, {
              headers: { origin: 'https://evil.com' },
            }),
          );
          expect(health.status).toBe(403);
        }),
      ),
    ));

  it('switches Speech to Text on, streams how it stands, transcribes PCM and switches it off', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          const db = join(folder(), 'ai.db');
          yield* Layer.build(
            server({
              port,
              db,
              harnesses: makeFakeHarness().layer,
              speech: makeFakeSpeech().layer,
            }),
          );
          const client = yield* Layer.build(
            CodeClient.layer(`ws://127.0.0.1:${port}/rpc`),
          );
          const api = Context.get(client, CodeClient);
          const states: Array<{ readonly _tag: string }> = [];
          yield* Effect.forkScoped(
            Stream.runForEach(api.watchSpeechToText(), (state) =>
              Effect.sync(() => void states.push(state)),
            ),
          );
          yield* eventually(() => expect(states).toEqual([{ _tag: 'Off' }]));
          // Two seconds of 16 kHz 16-bit PCM.
          const audio = new Uint8Array(64_000);
          expect(yield* Effect.flip(api.transcribe({ audio }))).toMatchObject({
            _tag: 'SpeechToTextNotReady',
            state: 'Off',
          });

          yield* api.enableSpeechToText();
          yield* eventually(() =>
            expect(states.at(-1)).toEqual({ _tag: 'Ready' }),
          );
          expect(yield* api.transcribe({ audio })).toBe('heard 32000 samples');
          expect(
            yield* Effect.flip(api.transcribe({ audio: new Uint8Array(3) })),
          ).toMatchObject({ _tag: 'TranscriptionFailed' });

          yield* api.disableSpeechToText();
          yield* eventually(() =>
            expect(states.at(-1)).toEqual({ _tag: 'Off' }),
          );
        }),
      ),
    ));

  it('lists and makes folders under the home it was given', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          const home = folder();
          yield* Layer.build(
            server({
              port,
              db: join(folder(), 'ai.db'),
              harnesses: makeFakeHarness().layer,
              home,
            }),
          );
          const client = yield* Layer.build(
            CodeClient.layer(`ws://127.0.0.1:${port}/rpc`),
          );
          const api = Context.get(client, CodeClient);
          const created = yield* api.createFolder({ parent: '~', name: 'new' });
          expect(created.path).toMatch(/\/new$/);
          expect(yield* api.listFolder({ path: '~' })).toMatchObject({
            parent: null,
            folders: [{ name: 'new', hidden: false, link: false }],
            truncated: false,
          });
          expect(
            yield* Effect.flip(api.listFolder({ path: '/' })),
          ).toMatchObject({ _tag: 'OutsideHome' });
          expect(
            yield* Effect.flip(api.createFolder({ parent: '~', name: 'new' })),
          ).toMatchObject({ _tag: 'FolderExists' });
        }),
      ),
    ));

  it(
    'syncs a session live, and resumes every feed from its cursor after a restart',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const port = yield* Effect.promise(freePort);
            const db = join(folder(), 'ai.db');
            const fake = makeFakeHarness({ hold: true, oneShot: 'Greeting' });
            const options = { port, db, harnesses: fake.layer };

            let running = yield* Scope.make();
            yield* Layer.buildWithScope(server(options), running);

            // The client, with its messages feed watched on the wire.
            const client = yield* Layer.build(
              CodeClient.layer(`ws://127.0.0.1:${port}/rpc`),
            );
            const api = Context.get(client, CodeClient);
            const asked: Array<string | null> = [];
            const received: Array<string> = [];
            const watched = new Proxy(api, {
              get: (target, key) =>
                key === 'messages'
                  ? (payload: Parameters<typeof api.messages>[0]) => {
                      asked.push(payload.after?.meta._u ?? null);
                      return api
                        .messages(payload)
                        .pipe(
                          Stream.tap((batch) =>
                            Effect.sync(() =>
                              received.push(
                                ...batch.map((each) => each.meta._u),
                              ),
                            ),
                          ),
                        );
                    }
                  : Reflect.get(target, key),
            });
            const status = yield* SubscriptionRef.make('connecting');
            yield* Effect.forkScoped(
              Stream.runForEach(
                Stream.provideContext(connection, client),
                (now) => SubscriptionRef.set(status, now),
              ),
            );

            const app = yield* Runtime.start(
              Root,
              Layer.mergeAll(
                ReplicaStore.memory(),
                CodeClients.make(() =>
                  Layer.succeedContext(
                    Context.add(client, CodeClient, watched),
                  ),
                ),
              ),
            );
            const page = () =>
              app.instance({ from: 'test' }).children.page as unknown as {
                readonly children: {
                  readonly projects: {
                    readonly model: { readonly rows: Rows };
                  };
                  readonly messages?: {
                    readonly model: { readonly rows: Rows };
                  };
                };
              };
            const lines = () =>
              [...(page().children.messages?.model.rows ?? [])]
                .sort((a, b) => a.row.id.localeCompare(b.row.id))
                .map(line);

            const project = yield* api.addProject({ path: folder() });
            yield* eventually(() =>
              expect(page().children.projects.model.rows).toHaveLength(1),
            );

            const session = yield* api.startSession({
              projectId: project.id,
              account: 'claude',
              model: 'claude-test',
              settings: {},
              text: 'hi',
              attachments: [],
            });
            app.send('Root/page#1', { _tag: 'Open', sessionId: session.id });
            yield* eventually(() =>
              expect(lines()).toEqual(['turnStarted hi', 'text echo:hi']),
            );

            // The server goes away mid-turn: the turn is ended as cancelled.
            yield* stop(running);
            yield* eventually(() =>
              expect(SubscriptionRef.getUnsafe(status)).toBe('reconnecting'),
            );
            const before = received.at(-1)!;

            running = yield* Scope.make();
            yield* Layer.buildWithScope(server(options), running);
            yield* eventually(() =>
              expect(SubscriptionRef.getUnsafe(status)).toBe('connected'),
            );
            yield* eventually(() =>
              expect(lines()).toEqual([
                'turnStarted hi',
                'text echo:hi',
                'turnEnded',
              ]),
            );
            // The feed reopened from the newest message it had passed on.
            expect(asked).toContain(before);

            yield* api.send({
              sessionId: session.id,
              text: 'again',
              attachments: [],
            });
            yield* eventually(() =>
              expect(lines()).toEqual([
                'turnStarted hi',
                'text echo:hi',
                'turnEnded',
                'turnStarted again',
                'text echo:again',
              ]),
            );
            expect(new Set(received).size).toBe(received.length);
            // The agent was resumed by its native id.
            expect(fake.opens.at(-1)?.nativeId).toBe('native-1');
            yield* stop(running);
          }),
        ),
      ),
    30_000,
  );

  it(
    'syncs each Machine through its own socket, found by its id',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ports = {
              one: yield* Effect.promise(freePort),
              two: yield* Effect.promise(freePort),
            };
            for (const port of Object.values(ports))
              yield* Layer.build(
                server({
                  port,
                  db: join(folder(), 'ai.db'),
                  harnesses: makeFakeHarness().layer,
                }),
              );
            const dialled: Array<string> = [];
            const app = yield* Runtime.start(
              TwoMachines,
              Layer.mergeAll(
                ReplicaStore.memory(),
                CodeClients.layer.pipe(
                  Layer.provide(
                    Layer.succeed(MachineAddress, {
                      of: (machineId) =>
                        Effect.sync(() => {
                          dialled.push(machineId);
                          return {
                            url: `ws://127.0.0.1:${ports[machineId as keyof typeof ports]}/rpc`,
                          };
                        }),
                    }),
                  ),
                ),
              ),
            );
            const rows = (machine: 'one' | 'two') =>
              (
                app.instance({ from: 'test' }).children[machine] as unknown as {
                  readonly model: {
                    readonly rows: ReadonlyArray<{
                      readonly row: { readonly id: string };
                    }>;
                    readonly neverSynced: ReadonlyArray<string>;
                  };
                }
              ).model;
            yield* eventually(() => {
              expect(rows('one').neverSynced).toEqual([]);
              expect(rows('two').neverSynced).toEqual([]);
            });

            const path = folder();
            const one = yield* Layer.build(
              CodeClient.layer(`ws://127.0.0.1:${ports.one}/rpc`),
            );
            const added = yield* Context.get(one, CodeClient).addProject({
              path: folder(),
            });
            yield* eventually(() =>
              expect(rows('one').rows.map(({ row }) => row.id)).toEqual([
                added.id,
              ]),
            );
            expect(rows('two').rows).toEqual([]);
            // One socket each, however many feeds its Instance opened.
            expect([...new Set(dialled)].sort()).toEqual(['one', 'two']);
          }),
        ),
      ),
    30_000,
  );

  it(
    'answers the agent features over RPC: harnesses, accounts, skills, ask, fork and jobs',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const port = yield* Effect.promise(freePort);
            const db = join(folder(), 'ai.db');
            const fake = makeFakeHarness();
            yield* Layer.build(server({ port, db, harnesses: fake.layer }));
            const client = yield* Layer.build(
              CodeClient.layer(`ws://127.0.0.1:${port}/rpc`),
            );
            const api = Context.get(client, CodeClient);

            expect(yield* api.harnesses()).toMatchObject([
              {
                account: 'claude',
                name: 'claude',
                label: 'Claude',
                available: true,
                unavailableReason: null,
              },
            ]);
            const invalid = yield* Effect.flip(
              api.saveHarnessAccount({
                id: 'claude',
                harness: 'claude',
                name: 'Claude',
                binaryPath: '/no/such',
                home: null,
              }),
            );
            expect(invalid).toMatchObject({
              _tag: 'InvalidBinary',
              message: 'Nothing is at /no/such',
            });
            const work = yield* api.saveHarnessAccount({
              id: null,
              harness: 'claude',
              name: 'Claude work',
              binaryPath: null,
              home: folder(),
            });
            expect(yield* api.harnessAccounts()).toMatchObject([
              { id: 'claude', binaryPath: null, isDefault: true },
              { id: work.id, name: 'Claude work', isDefault: false },
            ]);
            expect(
              (yield* api.harnesses()).map(({ account, label }) => [
                account,
                label,
              ]),
            ).toEqual([
              ['claude', 'Claude'],
              [work.id, 'Claude work'],
            ]);
            expect(
              yield* Effect.flip(api.removeHarnessAccount({ id: 'claude' })),
            ).toMatchObject({ _tag: 'InvalidAccount' });
            yield* api.removeHarnessAccount({ id: work.id });

            const project = yield* api.addProject({ path: folder() });
            expect(
              yield* api.skills({ projectId: project.id, account: 'claude' }),
            ).toEqual(FAKE_SKILLS);

            const session = yield* api.startSession({
              projectId: project.id,
              account: 'claude',
              model: 'claude-test',
              settings: {},
              text: 'hi',
              attachments: [],
            });
            const fork = yield* api
              .forkSession({ sessionId: session.id, afterTurnId: null })
              .pipe(
                Effect.retry({
                  times: 100,
                  schedule: Schedule.spaced('20 millis'),
                }),
              );
            expect(fork).toMatchObject({
              title: 'hi',
              nativeId: 'native-1-fork',
              forkedFrom: { sessionId: session.id },
            });
            expect(
              yield* api.ask({
                sessionId: session.id,
                question: 'why?',
                schema: null,
              }),
            ).toEqual({ _tag: 'Text', text: 'answer:why?' });
            expect(
              (yield* Effect.flip(
                api.ask({ sessionId: 'nope', question: 'why?', schema: null }),
              ))._tag,
            ).toBe('SessionNotFound');
            expect(
              yield* api.contextUsage({ sessionId: session.id }),
            ).toMatchObject({ usedTokens: 1000 });
            expect(yield* api.backgroundJobs().pipe(Stream.runHead)).toEqual(
              Option.some([]),
            );

            yield* api.settleSession({ sessionId: fork.id });
            yield* api.unsettleSession({ sessionId: fork.id });
            expect(
              (yield* Effect.flip(api.settleSession({ sessionId: 'nope' })))
                ._tag,
            ).toBe('SessionNotFound');
          }),
        ),
      ),
    30_000,
  );
});
