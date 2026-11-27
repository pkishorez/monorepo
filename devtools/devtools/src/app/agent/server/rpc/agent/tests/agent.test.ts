import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Deferred, Effect, Fiber, Layer, Stream } from 'effect';
import type { Scope } from 'effect';
import { RpcTest, type RpcClient } from 'effect/rpc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Claude, type ClaudeOptions } from '@kestack/ai-toolkit-v2/claude';
import * as ClaudeFake from '@kestack/ai-toolkit-v2/claude/fake';
import { sqliteThreadStoreLayer } from '../../../services/thread-store/real/index.js';
import { AgentRpc, statusOf, type Message } from '../contract/index.js';
import { agentRpcLayer } from '../real/index.js';

type Client = RpcClient.FromGroup<typeof AgentRpc>;

const MCP = 'http://127.0.0.1:4983/mcp';

let folder: string;
const KIND = 'story';

let started: Array<ClaudeOptions | undefined> = [];
let resumed: Array<string> = [];
beforeEach(async () => {
  started = [];
  resumed = [];
  folder = await realpath(await mkdtemp(join(tmpdir(), 'devtools-agent-')));
});
afterEach(() => rm(folder, { recursive: true, force: true }));

const recording = (name: string): ClaudeFake.Recording => {
  const found = ClaudeFake.recordings.find((one) => one.name === name);
  if (found === undefined) throw new Error(`No recording ${name}`);
  return found;
};

const reading = (): ClaudeFake.Recording => {
  const create = recording('create');
  const toolUse = recording('structured').entries.flatMap((entry) =>
    'message' in entry &&
    entry.message.type === 'assistant' &&
    entry.message.message.content[0]?.type === 'tool_use'
      ? [entry.message]
      : [],
  )[0];
  const block = toolUse?.message.content[0];
  if (toolUse === undefined || block?.type !== 'tool_use')
    throw new Error('No tool use recorded');
  const tool = (name: string, input: Record<string, unknown>) => ({
    message: {
      ...toolUse,
      message: { ...toolUse.message, content: [{ ...block, name, input }] },
    },
  });
  return {
    name: 'reading',
    entries: [
      ...create.entries.slice(0, 4),
      tool('Read', { file_path: join(folder, 'src/app.ts') }),
      tool('Grep', { pattern: 'Actor', path: join(folder, 'src') }),
      tool('Glob', { pattern: '**/*.tsx' }),
      ...create.entries.slice(4),
    ],
  };
};

const dies: ClaudeFake.Recording = {
  name: 'dies',
  entries: [...recording('create').entries.slice(0, 3), { exit: 'killed' }],
};

const run = <A, E>(
  use: (client: Client) => Effect.Effect<A, E, Claude | Scope.Scope>,
  db = ':memory:',
) =>
  Effect.runPromise(
    Effect.scoped(Effect.flatMap(RpcTest.makeClient(AgentRpc), use)).pipe(
      Effect.provide(
        agentRpcLayer({ mcp: MCP }).pipe(
          Layer.provideMerge(
            Layer.effect(
              Claude,
              Effect.map(Claude, (claude) =>
                Claude.of({
                  ...claude,
                  create: (input) => {
                    started.push(input.options);
                    return claude.create(input);
                  },
                  send: (input) => {
                    resumed.push(input.id);
                    return claude.send(input);
                  },
                }),
              ),
            ).pipe(
              Layer.provide(
                ClaudeFake.layer({
                  recordings: [...ClaudeFake.recordings, reading(), dies],
                }),
              ),
            ),
          ),
          Layer.provideMerge(sqliteThreadStoreLayer({ path: db })),
        ),
      ),
    ),
  );

const plain = (messages: ReadonlyArray<Message>) =>
  messages.map((message) =>
    Object.fromEntries(Object.entries(message).filter(([key]) => key !== 'at')),
  );

const until = (
  client: Client,
  thread: string,
  reached: (messages: ReadonlyArray<Message>) => boolean,
) =>
  client.watch({ thread }).pipe(
    Stream.filter(reached),
    Stream.take(1),
    Stream.runCollect,
    Effect.map((all) => plain([...all][0] ?? [])),
  );

const answered = (client: Client, thread: string) =>
  until(client, thread, (messages) => statusOf(messages) !== 'running');

const waiting = (client: Client, thread: string) =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    yield* until(client, thread, (messages) =>
      messages.some((message) => message._tag === 'Activity'),
    );
    const [live] = yield* claude.live;
    if (live === undefined) return;
    yield* claude.watch(live.id).pipe(
      Stream.filter((now) => now.requests.length === 1),
      Stream.take(1),
      Stream.runDrain,
    );
  });

describe('the Agent RPC, on the fake Claude Code', () => {
  it('ask answers in a new thread, listed for its folder', () =>
    run((client) =>
      Effect.gen(function* () {
        const thread = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'create',
        });
        expect(yield* answered(client, thread)).toEqual([
          { _tag: 'User', text: 'create' },
          { _tag: 'Status', status: 'running' },
          { _tag: 'Assistant', text: 'apple' },
          { _tag: 'Status', status: 'done' },
        ]);
        expect(yield* client.threads({ folder, kind: KIND })).toEqual([
          {
            id: thread,
            folder,
            kind: KIND,
            title: 'create',
            createdAt: expect.any(Number),
            mcp: false,
            status: 'done',
          },
        ]);
        expect(
          yield* client.threads({ folder: '/elsewhere', kind: KIND }),
        ).toEqual([]);
      }),
    ));

  it('ask with mcp gives Claude Code DevTools’ own MCP server and its tools, and only then', () =>
    run((client) =>
      Effect.gen(function* () {
        const withMcp = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'create',
          mcp: true,
        });
        yield* answered(client, withMcp);
        const without = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'create',
        });
        yield* answered(client, without);
        expect(
          started.map((options) => [
            options?.mcpServers,
            options?.allowedTools,
          ]),
        ).toEqual([
          [{ devtools: { type: 'http', url: MCP } }, ['mcp__devtools']],
          [{}, undefined],
        ]);
      }),
    ));

  it('followUp sends on the same Claude session', () =>
    run((client) =>
      Effect.gen(function* () {
        const claude = yield* Claude;
        const thread = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'create',
        });
        yield* answered(client, thread);
        const [first] = yield* claude.live;
        yield* client.followUp({ thread, prompt: 'send' });
        const messages = yield* until(
          client,
          thread,
          (all) =>
            all.filter((message) => message._tag === 'Assistant').length === 2,
        );
        expect(messages.slice(4)).toEqual([
          { _tag: 'User', text: 'send' },
          { _tag: 'Status', status: 'running' },
          { _tag: 'Assistant', text: 'pear' },
          { _tag: 'Status', status: 'done' },
        ]);
        expect((yield* claude.live).map((live) => live.id)).toEqual([
          first?.id,
        ]);
      }),
    ));

  it('a JSON schema brings the structured answer back as data', () =>
    run((client) =>
      Effect.gen(function* () {
        const thread = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'structured',
          system: 'Answer in numbers.',
          schema: {
            type: 'object',
            properties: { answer: { type: 'number' } },
            required: ['answer'],
          },
        });
        const messages = yield* answered(client, thread);
        expect(messages.at(-2)).toEqual({
          _tag: 'Assistant',
          data: { answer: 5 },
        });
      }),
    ));

  it('tool uses become activity lines, paths shown from the folder', () =>
    run((client) =>
      Effect.gen(function* () {
        const thread = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'reading',
        });
        const messages = yield* answered(client, thread);
        expect(
          messages.flatMap((message) =>
            message._tag === 'Activity' ? [message.text] : [],
          ),
        ).toEqual([
          'Reading src/app.ts',
          'Searching for Actor in src',
          'Finding **/*.tsx',
        ]);
      }),
    ));

  it('cancel stops the run and keeps the thread', () =>
    run((client) =>
      Effect.gen(function* () {
        const thread = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'permission',
        });
        yield* waiting(client, thread);
        const busy = yield* Effect.flip(
          client.followUp({ thread, prompt: 'send' }),
        );
        expect(busy.reason).toBe('busy');
        yield* client.cancel({ thread });
        expect((yield* answered(client, thread)).at(-1)).toEqual({
          _tag: 'Status',
          status: 'cancelled',
        });
        expect((yield* client.threads({ folder, kind: KIND }))[0]?.status).toBe(
          'cancelled',
        );
        yield* client.followUp({ thread, prompt: 'send' });
        const messages = yield* until(
          client,
          thread,
          (all) => statusOf(all) === 'done',
        );
        expect(messages.at(-2)).toEqual({ _tag: 'Assistant', text: 'pear' });
      }),
    ));

  it('a run that fails says why, and the thread can be asked again', () =>
    run((client) =>
      Effect.gen(function* () {
        const thread = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'dies',
        });
        expect((yield* answered(client, thread)).at(-1)).toEqual({
          _tag: 'Status',
          status: 'failed',
          reason: 'killed',
        });
        yield* client.followUp({ thread, prompt: 'create' });
        const messages = yield* until(
          client,
          thread,
          (all) => statusOf(all) === 'done',
        );
        expect(messages.at(-2)).toEqual({ _tag: 'Assistant', text: 'apple' });
      }),
    ));

  it('a missing folder fails the run without starting Claude Code', () =>
    run((client) =>
      Effect.gen(function* () {
        const claude = yield* Claude;
        const missing = join(folder, 'missing');
        const thread = yield* client.ask({
          folder: missing,
          kind: KIND,
          prompt: 'create',
        });
        expect((yield* answered(client, thread)).at(-1)).toEqual({
          _tag: 'Status',
          status: 'failed',
          reason: `${missing} does not exist.`,
        });
        expect(yield* claude.live).toEqual([]);
      }),
    ));

  it('an unknown thread is refused', () =>
    run((client) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          client.followUp({ thread: 'nope', prompt: 'create' }),
        );
        expect(error.reason).toBe('unknown-thread');
      }),
    ));

  it('threads of another kind are not listed', () =>
    run((client) =>
      Effect.gen(function* () {
        const thread = yield* client.ask({
          folder,
          kind: KIND,
          prompt: 'create',
        });
        yield* answered(client, thread);
        expect(yield* client.threads({ folder, kind: 'chat' })).toEqual([]);
      }),
    ));
});

describe('the Agent RPC, across restarts', () => {
  it('keeps a thread, its messages and its Claude session', async () => {
    const db = join(folder, 'devtools.sqlite');
    const first = await run(
      (client) =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          const thread = yield* client.ask({
            folder,
            kind: KIND,
            prompt: 'create',
          });
          const messages = yield* answered(client, thread);
          const [live] = yield* claude.live;
          return { thread, messages, session: live?.id };
        }),
      db,
    );
    await run(
      (client) =>
        Effect.gen(function* () {
          expect(yield* client.threads({ folder, kind: KIND })).toEqual([
            {
              id: first.thread,
              folder,
              kind: KIND,
              title: 'create',
              createdAt: expect.any(Number),
              mcp: false,
              status: 'done',
            },
          ]);
          expect(yield* answered(client, first.thread)).toEqual(first.messages);
          yield* client.followUp({ thread: first.thread, prompt: 'send' });
          expect(resumed).toEqual([first.session]);
        }),
      db,
    );
  });

  it('marks a run that DevTools stopped in the middle as failed', async () => {
    const db = join(folder, 'devtools.sqlite');
    const thread = await run(
      (client) =>
        Effect.gen(function* () {
          const asked = yield* client.ask({
            folder,
            kind: KIND,
            prompt: 'permission',
          });
          yield* waiting(client, asked);
          return asked;
        }),
      db,
    );
    await run(
      (client) =>
        Effect.gen(function* () {
          expect((yield* answered(client, thread)).at(-1)).toEqual({
            _tag: 'Status',
            status: 'failed',
            reason: 'DevTools restarted before this answer finished.',
          });
          yield* client.followUp({ thread, prompt: 'create' });
          expect(
            (yield* until(client, thread, (all) => statusOf(all) !== 'running'))
              .filter((message) => message._tag === 'User')
              .map((message) => message.text),
          ).toEqual(['permission', 'create']);
        }),
      db,
    );
  });
});

describe('clear', () => {
  it('deletes every thread of a kind in a folder, for good, and only those', async () => {
    const db = join(folder, 'devtools.sqlite');
    const kept = await run(
      (client) =>
        Effect.gen(function* () {
          const busy = yield* client.ask({
            folder,
            kind: KIND,
            prompt: 'permission',
          });
          yield* waiting(client, busy);
          const done = yield* client.ask({
            folder,
            kind: KIND,
            prompt: 'create',
          });
          yield* answered(client, done);
          const chat = yield* client.ask({
            folder,
            kind: 'chat',
            prompt: 'create',
          });
          yield* answered(client, chat);
          const seen = yield* Deferred.make<void>();
          const watching = yield* client.watch({ thread: busy }).pipe(
            Stream.tap(() => Deferred.succeed(seen, undefined)),
            Stream.runDrain,
            Effect.forkScoped,
          );
          yield* Deferred.await(seen);
          expect(yield* client.clear({ folder, kind: KIND })).toBe(2);
          yield* Fiber.join(watching);
          expect(yield* client.threads({ folder, kind: KIND })).toEqual([]);
          const gone = yield* Effect.flip(
            client.followUp({ thread: done, prompt: 'send' }),
          );
          expect(gone.reason).toBe('unknown-thread');
          return chat;
        }),
      db,
    );
    await run(
      (client) =>
        Effect.gen(function* () {
          expect(yield* client.threads({ folder, kind: KIND })).toEqual([]);
          expect(
            (yield* client.threads({ folder, kind: 'chat' })).map(
              ({ id }) => id,
            ),
          ).toEqual([kept]);
        }),
      db,
    );
  });
});
