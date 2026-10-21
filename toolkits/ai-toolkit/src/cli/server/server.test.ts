import { mkdtempSync, rmSync } from 'node:fs';
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
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ai, AiClient, AiLive, connection } from '../../client/index.js';
import { makeFakeHarness } from '../../fake-harness/index.js';
import { server } from './index.js';

/*
 * The whole stack: the server on a real port, an app with the real client
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
  from: () => Effect.all({ ai: Ai.get() }),
  query:
    (_, { ai }) =>
    (q) =>
      q.from({ p: ai.projects }),
});

const Messages = Query.make('Messages', {
  props: Schema.Struct({ sessionId: Schema.String }),
  from: () => Effect.all({ ai: Ai.get() }),
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
    replicas: Replicas.child([AiLive]),
    page: { actor: Page },
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

describe('the server, through the client and Replica', () => {
  it(
    'syncs a session live, and resumes every feed from its cursor after a restart',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const port = yield* Effect.promise(freePort);
            const db = join(folder(), 'ai.db');
            const fake = makeFakeHarness({ hold: true, title: 'Greeting' });
            const options = { port, db, harnesses: fake.layer };

            let running = yield* Scope.make();
            yield* Layer.buildWithScope(server(options), running);

            // The client, with its messages feed watched on the wire.
            const client = yield* Layer.build(
              AiClient.layer(`ws://127.0.0.1:${port}/rpc`),
            );
            const api = Context.get(client, AiClient);
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
                Layer.succeedContext(Context.add(client, AiClient, watched)),
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
              harness: 'claude',
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
});
