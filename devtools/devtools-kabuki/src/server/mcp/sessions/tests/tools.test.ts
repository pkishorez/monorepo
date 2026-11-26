import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Context, Effect, Layer, Schema, Scope, SubscriptionRef } from 'effect';
import { McpProtocol, McpServer } from 'effect/ai';
import { HttpRouter } from 'effect/http';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Fake, FakeWorld } from '@kestack/kabuki/fake';
import { describe, expect, it } from 'vitest';
import { connect } from '../../../../app.tsx';
import { kabukiRoutes } from '../../../../devtools.ts';
import { started } from '../../../../services/kabuki-session/tests/diary.ts';

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
      Layer.mergeAll(
        kabukiRoutes({ origins: [] }),
        McpServer.layerHttp({
          name: 'devtools',
          version: '0.0.0',
          path: '/mcp',
          protocols: [McpProtocol.v2025_06_18],
        }),
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

describe('the Kabuki tools over MCP', () => {
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
            'kabuki_timeline',
            'kabuki_travel',
          ]);
          expect(JSON.stringify(tools).length).toBeLessThan(4_000);

          const none = yield* call('kabuki_look', { session: 'diary' });
          expect(none.isError).toBe(true);
          expect(JSON.parse(none.content[0]!.text)).toEqual({
            _tag: 'KabukiSessionNotFound',
            name: 'diary',
            available: [],
          });

          const world = FakeWorld.make([lights]);
          const services = yield* Layer.build(world.layer);
          const diary = yield* started;
          diary.write('first', 5);
          const stop = connect({
            url: `ws://127.0.0.1:${port}`,
            name: 'diary',
            environment: 'kishores-mbp',
            world,
          })(diary.app);
          yield* Effect.addFinalizer(() => Effect.sync(stop));

          const listed = yield* until(
            call('kabuki_sessions'),
            (result) => result.structuredContent.sessions.length === 1,
          );
          expect(listed.structuredContent.sessions).toEqual([
            { name: 'diary', app: 'Diary', url: expect.any(String) },
          ]);

          const tree = yield* call('kabuki_look', { session: 'diary' });
          expect(tree.structuredContent.instances).toEqual([
            'Diary',
            ' Counter',
          ]);
          expect(tree.structuredContent.opened).toBeUndefined();

          const opened = yield* call('kabuki_look', {
            session: 'diary',
            open: ['Diary'],
          });
          expect(opened.structuredContent.opened.Diary).toEqual({
            about: 'Notes, each with when it was written',
            model: {
              notes: [{ at: new Date(5).toISOString(), text: 'first' }],
            },
            takes: [
              'Wrote { note: { at: string; text: string } }  // A note was written',
            ],
          });

          const timeline = yield* call('kabuki_timeline', {
            session: 'diary',
          });
          expect(timeline.structuredContent.last).toEqual([
            {
              id: expect.any(Number),
              tag: 'Wrote',
              to: 'Diary',
              from: expect.any(String),
              outcome: 'handled',
            },
          ]);

          const sent = yield* call('kabuki_send', {
            session: 'diary',
            to: 'Diary',
            message: {
              _tag: 'Wrote',
              note: { at: new Date(9).toISOString(), text: 'second' },
            },
          });
          expect(sent.structuredContent.sent).toBe('handled');
          expect(sent.structuredContent.model.notes).toHaveLength(2);

          const unknown = yield* call('kabuki_send', {
            session: 'diary',
            to: 'Nobody',
            message: { _tag: 'Wrote' },
          });
          expect(JSON.parse(unknown.content[0]!.text)).toMatchObject({
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
          expect(refused.content[0]!.text).toContain('MessageRefused');

          const first = timeline.structuredContent.last[0].id;
          expect(
            (yield* call('kabuki_travel', { session: 'diary', to: 'start' }))
              .structuredContent,
          ).toEqual({ at: 'start' });
          expect(
            (yield* call('kabuki_travel', { session: 'diary', to: null }))
              .isError,
          ).toBe(false);
          yield* call('kabuki_fork', { session: 'diary', from: first });
          expect(diary.app.history.head).toBe(first);

          const switched = yield* call('kabuki_control', {
            session: 'diary',
            fake: 'lights',
            control: 'Switched',
            payload: { on: true },
          });
          expect(switched.structuredContent).toEqual({ done: true });
          expect(yield* Context.get(services, Lights).on).toBe(true);
          const fakes = yield* call('kabuki_fakes', { session: 'diary' });
          expect(fakes.structuredContent.fakes).toEqual([
            {
              name: 'lights',
              value: { on: true },
              controls: [
                'Switched { on: boolean }  // The lights go on or off',
              ],
            },
          ]);

          stop();
          const left = yield* until(
            call('kabuki_timeline', { session: 'diary' }),
            (result) => result.isError,
          );
          expect(JSON.parse(left.content[0]!.text)).toMatchObject({
            _tag: 'KabukiSessionNotFound',
            name: 'diary',
          });
        }),
      ),
    20_000,
  );
});
