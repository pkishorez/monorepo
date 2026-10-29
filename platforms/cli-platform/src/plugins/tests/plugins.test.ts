import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Effect, Layer, Schema } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { Socket } from 'effect/socket';
import { NodeSocket } from '@effect/platform-node';
import { Actor, Runtime } from '@kestack/kabuki';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Downloads,
  folders as foldersOf,
  pluginFolders,
  socketPath,
} from '../../files/index.js';
import { ActorPlugin } from '../actor-plugin/index.js';
import {
  PluginControl,
  PluginEnv,
  PluginPaths,
  Plugins,
  type PluginState,
} from '../contract/index.js';
import { Ping } from './fixtures/ping.js';

/*
 * A CLI keeping a Plugin running, end to end: a parent Actor holds which
 * Plugin it wants, and real Plugin processes run from the fixtures.
 */

const fixture = (file: string) =>
  fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url));

const Wanted = Schema.Union([
  Schema.Struct({ hash: Schema.String, url: Schema.String }),
  Schema.Struct({ file: Schema.String }),
]);
type Wanted = typeof Wanted.Type;

/** A Plugin file to download: it runs the fixture `variant` from where it is. */
const bundle = (variant: string) => {
  const content = `await import(${JSON.stringify(pathToFileURL(fixture(`ping-${variant}.mjs`)).href)});\n`;
  return { content, hash: createHash('sha256').update(content).digest('hex') };
};

let base = '';
const server = createServer((request, response) => {
  const variant = request.url?.slice(1) ?? '';
  response.end(bundle(variant).content);
});
beforeAll(
  () =>
    new Promise<void>((done) =>
      server.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        done();
      }),
    ),
);
afterAll(() => new Promise<void>((done) => server.close(() => done())));

/** A CLI's folders in a fresh temporary home, and what its Plugin reports. */
const setup = () => {
  const home = mkdtempSync(join(tmpdir(), 'kestack-plugins-'));
  const cli = foldersOf({
    app: 'test',
    name: 'work',
    env: {},
    home,
    tmp: home,
  });
  const reports: Array<PluginState> = [];
  const layer = Layer.mergeAll(
    Downloads.layer(cli.cache),
    Layer.succeed(Plugins, {
      report: (_name, state) => Effect.sync(() => void reports.push(state)),
    }),
  );
  return {
    folders: pluginFolders(cli, 'ping'),
    socket: socketPath(cli.runtime, 'abcdef0123', 'ping'),
    reports,
    layer,
  };
};

/** The CLI side as a test writes it: one Plugin, wanted as the Model says. */
const cliOf = (
  plugin: { folders: ReturnType<typeof setup>['folders']; socket: string },
  first: Wanted,
) =>
  Actor.build(
    Actor.define('Cli', {
      model: Schema.Struct({ wanted: Wanted }),
      message: Schema.TaggedUnion({ Want: { wanted: Wanted } }),
    }),
    {
      init: () => ({ model: { wanted: first } }),
      children: {
        plugin: {
          actor: ActorPlugin,
          input: () => ({
            name: 'ping',
            folders: plugin.folders,
            socket: plugin.socket,
            pause: { first: 100, most: 400 },
          }),
          props: ({ model }) => ({ wanted: model.wanted }),
        },
      },
      on: { Want: ({ wanted }) => ({ model: { wanted } }) },
    },
  );

/** A client to the Plugin's own group on its socket. */
const pingAt = (socket: string) =>
  Effect.gen(function* () {
    const protocol = yield* Layer.build(
      RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
        Layer.provide(
          Socket.layerWebSocket(`ws+unix://${socket}:${PluginPaths.rpc}`),
        ),
        Layer.provide(NodeSocket.layerWebSocketConstructorWS),
        Layer.provide(RpcSerialization.layerJson),
      ),
    );
    return yield* RpcClient.make(Ping).pipe(Effect.provide(protocol));
  });

const controlAt = (socket: string) =>
  Effect.gen(function* () {
    const protocol = yield* Layer.build(
      RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
        Layer.provide(
          Socket.layerWebSocket(`ws+unix://${socket}:${PluginPaths.control}`),
        ),
        Layer.provide(NodeSocket.layerWebSocketConstructorWS),
        Layer.provide(RpcSerialization.layerJson),
      ),
    );
    return yield* RpcClient.make(PluginControl).pipe(Effect.provide(protocol));
  });

const eventually = (assertion: () => void, timeout = 20_000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout, interval: 50 }));

const last = (reports: ReadonlyArray<PluginState>) => reports.at(-1);

describe('a Plugin kept running by its CLI', () => {
  it(
    'downloads it, starts it, and serves its group on the socket',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const plugin = setup();
            const { hash } = bundle('a');
            const running = yield* Runtime.start(
              cliOf(plugin, { hash, url: `${base}/a` }),
              plugin.layer,
            );
            yield* eventually(() =>
              expect(last(plugin.reports)).toEqual({ _tag: 'Running', hash }),
            );
            const tags = plugin.reports.map(({ _tag }) => _tag);
            expect(tags.slice(0, 1)).toEqual(['Downloading']);
            expect(tags).toContain('Starting');
            const ping = yield* pingAt(plugin.socket);
            expect(yield* ping.ping()).toBe('pong a');
            const control = yield* controlAt(plugin.socket);
            expect(yield* control.status()).toMatchObject({ name: 'ping' });
            expect(
              readFileSync(
                join(plugin.folders.state, '..', 'ping.log'),
                'utf8',
              ),
            ).toContain('Listening on');
            expect(existsSync(join(plugin.folders.shared, 'started-a'))).toBe(
              true,
            );
            expect(running.running()).toBe(true);
          }),
        ),
      ),
    30_000,
  );

  it('finds its shared folder itself when an older CLI does not say where', async () => {
    const home = mkdtempSync(join(tmpdir(), 'kestack-plugins-'));
    const plugin = pluginFolders(
      foldersOf({ app: 'test', name: 'work', env: {}, home, tmp: home }),
      'ping',
    );
    for (const folder of [plugin.data, plugin.state, plugin.cache])
      mkdirSync(folder, { recursive: true });
    const child = spawn(process.execPath, [fixture('ping-a.mjs')], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      env: {
        ...process.env,
        HOME: home,
        XDG_DATA_HOME: '',
        KESTACK_PLUGIN_SHARED: '',
        [PluginEnv.name]: 'ping',
        [PluginEnv.socket]: join(home, 'ping.sock'),
        [PluginEnv.data]: plugin.data,
        [PluginEnv.state]: plugin.state,
        [PluginEnv.cache]: plugin.cache,
      },
    });
    try {
      await new Promise<void>((ready, failed) => {
        child.once('message', () => ready());
        child.once('exit', (code) => failed(new Error(`Exited ${code}`)));
      });
      expect(existsSync(join(plugin.shared, 'started-a'))).toBe(true);
    } finally {
      child.kill('SIGTERM');
    }
  }, 30_000);

  it(
    'swaps to a new file: the old process gets SIGTERM, the new one runs',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const plugin = setup();
            const running = yield* Runtime.start(
              cliOf(plugin, { file: fixture('ping-a.mjs') }),
              plugin.layer,
            );
            yield* eventually(() =>
              expect(last(plugin.reports)?._tag).toBe('Running'),
            );
            const before = yield* controlAt(plugin.socket);
            const { pid } = yield* before.status();
            running.send('Cli', {
              _tag: 'Want',
              wanted: { file: fixture('ping-b.mjs') },
            });
            yield* eventually(() =>
              expect(last(plugin.reports)).toEqual({
                _tag: 'Running',
                hash: fixture('ping-b.mjs'),
              }),
            );
            const ping = yield* pingAt(plugin.socket);
            expect(yield* ping.ping()).toBe('pong b');
            // The old one left the socket first; its finalizers ran after, so
            // it was stopped with SIGTERM, not killed.
            yield* eventually(() => {
              expect(existsSync(join(plugin.folders.data, 'stopped-a'))).toBe(
                true,
              );
              expect(() => process.kill(pid, 0)).toThrow();
            });
          }),
        ),
      ),
    30_000,
  );

  it(
    'starts the new file only once the old process has exited, however long it takes to stop',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const plugin = setup();
            const running = yield* Runtime.start(
              cliOf(plugin, { file: fixture('ping-slow.mjs') }),
              plugin.layer,
            );
            yield* eventually(() =>
              expect(last(plugin.reports)?._tag).toBe('Running'),
            );
            const before = yield* controlAt(plugin.socket);
            const { pid } = yield* before.status();
            running.send('Cli', {
              _tag: 'Want',
              wanted: { file: fixture('ping-b.mjs') },
            });
            // It leaves the socket at once, then takes two seconds to stop:
            // the new one waits all of it, so they never share the folders.
            yield* eventually(() =>
              expect(last(plugin.reports)).toEqual({
                _tag: 'Running',
                hash: fixture('ping-b.mjs'),
              }),
            );
            expect(existsSync(join(plugin.folders.data, 'stopped-slow'))).toBe(
              true,
            );
            expect(() => process.kill(pid, 0)).toThrow();
          }),
        ),
      ),
    30_000,
  );

  it('says a file: URL with no file is not on the shelf', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const plugin = setup();
          const hash = 'c'.repeat(64);
          const url = pathToFileURL(
            join(plugin.folders.cache, 'shelf', 'ping', `${hash}.mjs`),
          ).href;
          yield* Runtime.start(cliOf(plugin, { hash, url }), plugin.layer);
          yield* eventually(() =>
            expect(last(plugin.reports)).toMatchObject({
              _tag: 'Crashed',
              hash,
              log: [`ping ${hash} isn't on the shelf; run the build`],
            }),
          );
        }),
      ),
    ));

  it(
    'goes Crashed when its process exits, and tries again after a growing pause',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const plugin = setup();
            const startedAt: Array<number> = [];
            const reports = plugin.reports;
            const layer = Layer.mergeAll(
              Downloads.layer(join(plugin.folders.cache, '..', '..')),
              Layer.succeed(Plugins, {
                report: (_name, state) =>
                  Effect.sync(() => {
                    if (state._tag === 'Starting') startedAt.push(Date.now());
                    reports.push(state);
                  }),
              }),
            );
            yield* Runtime.start(
              cliOf(plugin, { file: fixture('crash.mjs') }),
              layer,
            );
            yield* eventually(() => expect(startedAt.length).toBe(4));
            const crashed = reports.find((report) => report._tag === 'Crashed');
            expect(crashed).toMatchObject({
              _tag: 'Crashed',
              hash: fixture('crash.mjs'),
              log: ['starting', 'boom'],
            });
            // Pauses of 100, 200 and 400 ms between starts.
            const gaps = startedAt.slice(1).map((at, i) => at - startedAt[i]!);
            expect(gaps[0]!).toBeGreaterThanOrEqual(100);
            expect(gaps[2]!).toBeGreaterThanOrEqual(400);
            expect(gaps[2]!).toBeGreaterThan(gaps[0]!);
          }),
        ),
      ),
    30_000,
  );
});
