import { createServer } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { Effect, Layer, Schedule, Stream } from 'effect';
import { HttpRouter } from 'effect/http';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import {
  KabukiSession,
  dialSessions,
  kabukiRoutes,
  remote,
} from '@kestack/devtools-kabuki/devtools';
import { describe, expect, it } from 'vitest';
import { Connect } from '../actor-connect/index.js';
import { attach, headless } from '../devtools/index.js';
import { devInput, makeWorld } from '../fakes.js';
import { hashOf } from '../services/cloud/fake/index.js';

interface Looked {
  readonly address: string;
  readonly actor: string;
  readonly key?: string;
  readonly state: string;
  readonly children: ReadonlyArray<Looked>;
}

const SESSION = 'ke-connect-fakes';

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createNetServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const devtoolsAt = (port: number) =>
  Layer.build(
    HttpRouter.serve(kabukiRoutes({ origins: [] }), {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provide(
        NodeHttpServer.layer(createServer, {
          host: '127.0.0.1',
          port,
          disablePreemptiveShutdown: true,
        }),
      ),
    ),
  );

const flat = (node: Looked): ReadonlyArray<Looked> => [
  node,
  ...node.children.flatMap(flat),
];

const tree = (node: Looked): Record<string, string> =>
  Object.fromEntries(
    flat(node).map((each) => [
      each.actor === 'Plugin' ? `Plugin ${each.key}` : each.actor,
      each.state,
    ]),
  );

const short = (name: string, release: number) =>
  `${name}@${hashOf(name, release)}`;

const connected = (origin: string) =>
  Effect.gen(function* () {
    const sessions = yield* dialSessions(origin);
    return yield* sessions.list().pipe(
      Effect.repeat({
        until: (list) => list.some((each) => each.name === SESSION),
        schedule: Schedule.spaced('20 millis'),
      }),
    );
  });

const drive = Effect.gen(function* () {
  const session = yield* KabukiSession;
  const treeNow = () =>
    Effect.map(session.look({ open: [] }), (look) => tree(look.root as Looked));
  const until = (expected: Record<string, string>) =>
    treeNow().pipe(
      Effect.repeat({
        until: (now) => JSON.stringify(now) === JSON.stringify(expected),
        schedule: Schedule.spaced('20 millis'),
      }),
      Effect.timeoutOrElse({
        duration: '5 seconds',
        orElse: () =>
          Effect.flatMap(treeNow(), (now) =>
            Effect.die(
              new Error(
                `Expected ${JSON.stringify(expected)}, the tree is ${JSON.stringify(now)}`,
              ),
            ),
          ),
      }),
    );
  const run = (fake: string, control: string, payload: object = {}) =>
    session.control({ fake, control, payload });
  const fakeState = (name: string) =>
    session.fakes().pipe(
      Stream.runHead,
      Effect.map((fakes) =>
        fakes._tag === 'Some'
          ? (fakes.value.find((each) => each.name === name)?.value as Record<
              string,
              unknown
            >)
          : undefined,
      ),
    );
  const asking = () =>
    fakeState('signIn').pipe(
      Effect.repeat({
        until: (now) => now?.['asking'] === true,
        schedule: Schedule.spaced('20 millis'),
      }),
    );
  return { session, until, run, fakeState, asking };
});

describe('Connect in DevTools, on its Fakes', () => {
  it('shows the Kabuki tree and moves through every scenario by the Fakes alone', async () => {
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* devtoolsAt(port);
          const world = makeWorld();
          const context = yield* Layer.build(world.layer);
          const app = yield* headless(Connect, {
            name: 'ke-connect',
            input: devInput({ heartbeatEvery: 30, tunnel: { reachEvery: 30 } }),
            layer: Layer.succeedContext(context),
          });
          yield* attach(app, {
            url: origin,
            environment: 'fakes',
            name: SESSION,
            world,
          });

          const listed = yield* connected(origin);
          expect(listed.find((each) => each.name === SESSION)).toMatchObject({
            app: 'ke-connect',
            environment: 'fakes',
          });

          const { session, until, run, fakeState, asking } = yield* drive.pipe(
            Effect.provideContext(yield* Layer.build(remote(origin, SESSION))),
          );
          const { root } = yield* session.blueprint();
          expect(root.actor).toBe('Connect');
          expect(root.children.map((child) => child.actor).sort()).toEqual([
            'Plugin',
            'Tunnel',
          ]);
          expect(
            (yield* session.fakes().pipe(Stream.runHead)).pipe((fakes) =>
              fakes._tag === 'Some' ? fakes.value.map((each) => each.name) : [],
            ),
          ).toEqual([
            'signIn',
            'cloud',
            'cloudflared',
            'plugins',
            'server',
            'control',
            'store',
          ]);

          yield* until({ Connect: 'SigningIn' });
          yield* asking();
          yield* run('signIn', 'Refuse');
          yield* until({ Connect: 'Stopped' });
          expect(
            (yield* session.look({ open: ['Connect'] })).opened['Connect']
              ?.state,
          ).toMatchObject({
            why: { _tag: 'Failed', reason: 'The device code was refused' },
          });

          yield* session.fork({ from: 'start' });
          yield* until({ Connect: 'SigningIn' });
          yield* asking();
          yield* run('signIn', 'Approve', { email: 'ada@kestack.test' });
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('echo', 1)}`]: 'Running',
          });
          expect((yield* fakeState('cloud'))?.['last']).toMatchObject({
            url: 'https://fake-1.trycloudflare.com',
            answer: 'Enabled',
          });

          yield* run('cloud', 'EnablePlugin', { name: 'notes' });
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('echo', 1)}`]: 'Running',
            [`Plugin ${short('notes', 1)}`]: 'Running',
          });

          yield* run('cloud', 'DisablePlugin', { name: 'echo' });
          yield* run('cloud', 'PublishRelease', { name: 'notes' });
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Running',
          });

          yield* run('plugins', 'FailStarts', { name: 'notes' });
          yield* run('plugins', 'Crash', { name: 'notes' });
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Crashed',
          });
          yield* run('plugins', 'FixStarts', { name: 'notes' });
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Running',
          });

          yield* run('cloud', 'EnablePlugin', { name: '../escape' });
          yield* Effect.sleep('100 millis');
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Running',
          });
          yield* run('cloud', 'DisablePlugin', { name: '../escape' });

          yield* run('cloudflared', 'DropTunnel');
          yield* Effect.sleep('100 millis');
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Running',
          });
          expect((yield* fakeState('cloudflared'))?.['url']).toBe(
            'https://fake-2.trycloudflare.com',
          );

          yield* run('cloudflared', 'CutReach');
          yield* Effect.sleep('300 millis');
          yield* run('cloudflared', 'RestoreReach');
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Running',
          });
          expect(
            Number((yield* fakeState('cloudflared'))?.['opened']),
          ).toBeGreaterThanOrEqual(3);

          yield* run('cloud', 'GoOffline');
          yield* Effect.sleep('100 millis');
          expect((yield* fakeState('cloud'))?.['last']).toMatchObject({
            answer: 'Unsent',
          });
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Running',
          });
          yield* run('cloud', 'ComeOnline');

          yield* run('cloud', 'ExpireSignIn');
          yield* until({ Connect: 'SigningIn' });
          yield* asking();
          yield* run('signIn', 'Approve', { email: 'ada@kestack.test' });
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Running',
          });

          const signedIn = (yield* session.watch().pipe(Stream.runHead)).pipe(
            (watched) =>
              watched._tag === 'Some' ? watched.value.now.head : null,
          );

          yield* run('control', 'Stop');
          yield* until({ Connect: 'Stopped' });
          expect(
            (yield* session.look({ open: ['Connect'] })).opened['Connect']
              ?.state,
          ).toMatchObject({ why: { _tag: 'Requested' } });

          yield* session.fork({ from: signedIn! });
          yield* until({
            Connect: 'SignedIn',
            Tunnel: 'Active',
            [`Plugin ${short('notes', 2)}`]: 'Running',
          });
          yield* run('cloud', 'RemoveConnection');
          yield* until({ Connect: 'Stopped' });
          expect(
            (yield* session.look({ open: ['Connect'] })).opened['Connect']
              ?.state,
          ).toMatchObject({ why: { _tag: 'Removed' } });
        }),
      ),
    );
  }, 30_000);
});
