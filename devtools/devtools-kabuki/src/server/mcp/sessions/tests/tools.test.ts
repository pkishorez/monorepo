import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Context, Effect, Layer, Schema, Scope, SubscriptionRef } from 'effect';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { McpProtocol, McpServer } from 'effect/ai';
import { HttpRouter } from 'effect/http';
import { NodeHttpServer } from '@effect/platform-node';
import { Actor, Command } from '@kestack/kabuki';
import { Fake, FakeWorld } from '@kestack/kabuki/fake';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connect } from '../../../../app.tsx';
import { kabukiRoutes } from '../../../../devtools.ts';
import {
  running,
  started,
} from '../../../../services/kabuki-session/tests/diary.ts';

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createNetServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });

const devtools = (port: number) =>
  Layer.build(
    HttpRouter.serve(
      kabukiRoutes({ origins: [] }).pipe(
        Layer.provideMerge(
          McpServer.layerHttp({
            name: 'devtools',
            version: '0.0.0',
            path: '/mcp',
            protocols: [McpProtocol.v2025_06_18],
          }),
        ),
      ),
      { disableLogger: true, disableListenLog: true },
    ).pipe(
      Layer.provide(
        NodeHttpServer.layer(createServer, {
          host: '127.0.0.1',
          port,
          disablePreemptiveShutdown: true,
        }),
      ),
    ),
  );

interface ToolResult {
  readonly isError: boolean;
  readonly structuredContent: any;
  readonly content: ReadonlyArray<{ readonly text: string }>;
}

const mcp = (port: number) =>
  Effect.promise(async () => {
    const url = `http://127.0.0.1:${port}/mcp`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    };
    const opened = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      }),
    });
    await opened.text();
    headers['mcp-session-id'] = opened.headers.get('mcp-session-id') ?? '';
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    }).then((response) => response.text());
    let id = 1;
    const rpc = (method: string, params: object) =>
      Effect.promise(async (): Promise<ToolResult> => {
        const answered = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
        });
        const text = await answered.text();
        const json = text.startsWith('{')
          ? text
          : text
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5))
              .at(-1)!;
        const parsed = JSON.parse(json);
        return (
          parsed.result ?? {
            isError: true,
            structuredContent: null,
            content: [{ text: JSON.stringify(parsed.error) }],
          }
        );
      });
    return {
      call: (name: string, args: object = {}) =>
        rpc('tools/call', { name, arguments: args }),
      list: () =>
        Effect.map(
          rpc('tools/list', {}),
          (result) =>
            (result as unknown as { tools: Array<{ name: string }> }).tools,
        ),
    };
  });

class Lights extends Context.Service<
  Lights,
  { readonly on: Effect.Effect<boolean> }
>()('Test/service/Lights') {}

const Lit = Schema.Struct({ on: Schema.Boolean });

const lights = Fake.make({
  name: 'lights',
  state: Lit,
  initial: { on: false },
  controls: {
    Switched: Fake.control(
      Lit,
      Schema.Struct({ on: Schema.Boolean }).annotate({
        description: 'The lights go on or off',
      }),
      ({ on }, state) => SubscriptionRef.set(state, { on }),
    ),
  },
  layer: (state) =>
    Layer.succeed(Lights)({
      on: Effect.map(SubscriptionRef.get(state), ({ on }) => on),
    }),
});

const until = <A>(
  read: Effect.Effect<A>,
  test: (a: A) => boolean,
): Effect.Effect<A> =>
  Effect.flatMap(read, (a) =>
    test(a)
      ? Effect.succeed(a)
      : Effect.flatMap(Effect.sleep('20 millis'), () => until(read, test)),
  );

const fetchOne = Command.make('fetch', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.as(Effect.sleep('300 millis'), { _tag: 'Fetched' as const, id }),
});

const explode = Command.make('explode', {
  run: () => Effect.die(new Error('exploded')),
});

const Fetcher = Actor.define('Fetcher', {
  model: { fetched: Schema.Array(Schema.String) },
  message: {
    Fetch: Schema.Struct({ id: Schema.String }).annotate({
      description: 'Fetch one by id',
    }),
    Fetched: { id: Schema.String },
    Explode: Schema.Struct({}).annotate({ description: 'Fail on purpose' }),
  },
}).build({
  init: () => ({ model: { fetched: [] } }),
  on: {
    Fetch: ({ id }) => ({ command: fetchOne({ id }) }),
    Fetched: ({ id }, { model }) => ({
      model: { fetched: [...model.fetched, id] },
    }),
    Explode: () => ({ command: explode() }),
  },
});

const textOf = (result: ToolResult) =>
  result.content.map(({ text }) => text).join('\n');

const linked = (
  port: number,
  name: string,
  app: AppRuntime,
  world?: FakeWorld,
) =>
  Effect.gen(function* () {
    const stop = connect({
      url: `ws://127.0.0.1:${port}`,
      name,
      environment: 'kishores-mbp',
      ...(world === undefined ? {} : { world }),
    })(app);
    yield* Effect.addFinalizer(() => Effect.sync(stop));
    return stop;
  });

describe('the Kabuki tools over MCP', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'read and move a live Kabuki Session by its name, and run its Fakes’ Controls',
    () =>
      run(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          yield* devtools(port);
          const { call, list } = yield* mcp(port);
          const tools = yield* list();
          expect(tools.map(({ name }) => name).sort()).toEqual([
            'kabuki_control',
            'kabuki_fakes',
            'kabuki_fork',
            'kabuki_look',
            'kabuki_send',
            'kabuki_sessions',
            'kabuki_step',
            'kabuki_timeline',
            'kabuki_travel',
          ]);
          expect(JSON.stringify(tools).length).toBeLessThan(4_400);

          const none = yield* call('kabuki_look', { session: 'diary' });
          expect(none.isError).toBe(true);
          expect(JSON.parse(textOf(none))).toEqual({
            _tag: 'KabukiSessionNotFound',
            name: 'diary',
            available: [],
          });

          const world = FakeWorld.make([lights]);
          const services = yield* Layer.build(world.layer);
          const diary = yield* started;
          diary.write('first', 5);
          const stop = yield* linked(port, 'diary', diary.app, world);

          const listed = yield* until(call('kabuki_sessions'), (result) =>
            textOf(result).startsWith('diary'),
          );
          expect(listed.structuredContent).toBeUndefined();
          expect(textOf(listed)).toBe('diary  Diary');

          expect(textOf(yield* call('kabuki_look', { session: 'diary' }))).toBe(
            [
              'at 0 (head), settled',
              'Diary  { notes: [{ at: 1970-01-01T00:00:00.005Z, text: first }] }',
              '  Counter  { count: 0 }',
            ].join('\n'),
          );
          expect(
            textOf(
              yield* call('kabuki_look', { session: 'diary', open: ['Diary'] }),
            ),
          ).toBe(
            [
              'at 0 (head), settled',
              'Diary',
              '  about: Notes, each with when it was written',
              '  model: { notes: [{ at: 1970-01-01T00:00:00.005Z, text: first }] }',
              '  takes:',
              '    Wrote { note: { at: string; text: string } }  // A note was written',
            ].join('\n'),
          );
          expect(
            textOf(yield* call('kabuki_timeline', { session: 'diary' })),
          ).toBe(
            [
              'head 0 · 1 Chain, newest first; id → kabuki_step',
              '0  outside  Wrote → Diary  · model notes',
            ].join('\n'),
          );

          const sent = textOf(
            yield* call('kabuki_send', {
              session: 'diary',
              to: 'Diary',
              message: {
                _tag: 'Wrote',
                note: { at: new Date(9).toISOString(), text: 'second' },
              },
            }),
          );
          expect(sent).toMatch(/^handled · settled in \d+\.\ds\nChain 1 @/);
          expect(sent.split('\n').slice(2)).toEqual([
            '1  Wrote → Diary  from devtools · handled',
            '  message: { note: { at: 1970-01-01T00:00:00.009Z, text: second } }',
            '  Diary:',
            '    notes: 1 → 2 items',
            '      + { at: 1970-01-01T00:00:00.009Z, text: second }',
          ]);

          diary.bump();
          diary.bump();
          expect(
            textOf(yield* call('kabuki_timeline', { session: 'diary' })),
          ).toBe(
            [
              'head 3 · 4 Chains, newest first; id → kabuki_step',
              '3  outside  Bumped → Counter  · model count',
              '2  outside  Bumped → Counter  · model count',
              '1  devtools  Wrote → Diary  · model notes',
              '0  outside  Wrote → Diary  · model notes',
            ].join('\n'),
          );
          expect(
            textOf(
              yield* call('kabuki_timeline', {
                session: 'diary',
                instance: 'counter',
              }),
            ).split('\n'),
          ).toHaveLength(3);
          expect(
            textOf(yield* call('kabuki_step', { session: 'diary', id: 2 })),
          ).toMatch(
            /^Chain 2 @\d+\.\ds, 1 Step\n2  Bumped → Counter  from outside · handled\n  Counter:\n    count: 0 → 1\nthe tree after it: kabuki_look at: 2$/,
          );
          expect(
            JSON.parse(
              textOf(yield* call('kabuki_step', { session: 'diary', id: 99 })),
            ),
          ).toEqual({
            _tag: 'StepNotFound',
            step: 99,
            oldest: 0,
            newest: 3,
          });

          const unknown = yield* call('kabuki_send', {
            session: 'diary',
            to: 'Nobody',
            message: { _tag: 'Wrote' },
          });
          expect(JSON.parse(textOf(unknown))).toMatchObject({
            _tag: 'InstanceNotFound',
            instance: 'Nobody',
            available: ['Diary', 'Counter'],
          });
          const refused = yield* call('kabuki_send', {
            session: 'diary',
            to: 'Diary',
            message: { _tag: 'Nope' },
          });
          expect(refused.isError).toBe(true);
          expect(textOf(refused)).toContain('MessageRefused');

          expect(
            textOf(
              yield* call('kabuki_travel', { session: 'diary', to: 'start' }),
            ),
          ).toBe(
            [
              'showing step start; kabuki_travel to: null comes back',
              'at start (a past step: no Work report)',
              'Diary  { notes: [] }',
              '  Counter  { count: 0 }',
            ].join('\n'),
          );
          expect(
            textOf(
              yield* call('kabuki_travel', { session: 'diary', to: null }),
            ),
          ).toMatch(/^back at the head\nat 3 \(head\), settled\n/);
          const forked = textOf(
            yield* call('kabuki_fork', { session: 'diary', from: 1 }),
          );
          expect(diary.app.history.head).toBe(1);
          expect(forked).toMatch(/^forked at 1; the app carries on from there/);
          expect(forked).toContain('  Counter  { count: 0 }');

          const switched = textOf(
            yield* call('kabuki_control', {
              session: 'diary',
              fake: 'lights',
              control: 'Switched',
              payload: { on: true },
            }),
          );
          expect(switched).toMatch(/^lights\.Switched: done · settled in /);
          expect(yield* Context.get(services, Lights).on).toBe(true);
          expect(
            textOf(yield* call('kabuki_fakes', { session: 'diary' })),
          ).toBe(
            [
              'fake lights',
              '  state: { on: true }',
              '  Switched { on: boolean }  // The lights go on or off',
            ].join('\n'),
          );

          stop();
          const left = yield* until(
            call('kabuki_timeline', { session: 'diary' }),
            (result) => result.isError,
          );
          expect(JSON.parse(textOf(left))).toMatchObject({
            _tag: 'KabukiSessionNotFound',
            name: 'diary',
          });
        }),
      ),
    20_000,
  );

  it(
    'wait after a Send for its Commands, and answer with what followed and any failure',
    () =>
      run(
        Effect.gen(function* () {
          vi.spyOn(console, 'error').mockImplementation(() => {});
          const port = yield* Effect.promise(freePort);
          yield* devtools(port);
          const { call } = yield* mcp(port);
          const { app } = yield* running(Fetcher);
          yield* linked(port, 'fetcher', app);
          yield* until(call('kabuki_sessions'), (result) =>
            textOf(result).startsWith('fetcher'),
          );

          const fetched = textOf(
            yield* call('kabuki_send', {
              session: 'fetcher',
              to: 'Fetcher',
              message: { _tag: 'Fetch', id: 'a' },
            }),
          ).split('\n');
          expect(fetched[0]).toMatch(/^handled · settled in (0\.[3-9]|[1-9])/);
          expect(fetched.slice(1)).toEqual([
            expect.stringMatching(/^Chain 0 @/),
            '0  Fetch → Fetcher  from devtools · handled',
            '  message: { id: a }',
            '  command fetch { id: a }',
            'then:',
            '  1  command fetch  Fetched → Fetcher  · model fetched',
          ]);

          const exploded = textOf(
            yield* call('kabuki_send', {
              session: 'fetcher',
              to: 'Fetcher',
              message: { _tag: 'Explode' },
            }),
          ).split('\n');
          expect(exploded[0]).toMatch(/^handled · a failure after /);
          expect(exploded.at(-2)).toBe('new failures:');
          expect(exploded.at(-1)).toMatch(
            /^ {2}Fetcher: command explode failed @\d+\.\ds: .*exploded/,
          );

          yield* call('kabuki_send', {
            session: 'fetcher',
            to: 'Fetcher',
            message: { _tag: 'Explode' },
          });
          const look = textOf(
            yield* call('kabuki_look', { session: 'fetcher' }),
          ).split('\n');
          expect(look[0]).toBe('at 3 (head), settled');
          expect(look[1]).toBe('problems:');
          expect(
            look.filter((line) => line.includes('explode failed')),
          ).toHaveLength(2);
          expect(look.at(-1)).toBe('Fetcher  { fetched: [a] }');
        }),
      ),
    20_000,
  );
});
