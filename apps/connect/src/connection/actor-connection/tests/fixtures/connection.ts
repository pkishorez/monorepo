import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Duration, Effect, Layer, Option, Stream } from 'effect';
import { afterEach, vi } from 'vitest';
import { History, Runtime } from '@kestack/kabuki';
import { Downloads, socketPath } from '@kestack/cli-platform/files';
import type { PluginState } from '@kestack/cli-platform/plugins';
import type { ConnectionStatus } from '../../../../cloud/contract/index.js';
import { ActorConnection, Cloud, type Reported, Tunnels } from '../../index.js';

/*
 * A Connection against a fake tunnel, whose addresses are numbered by how
 * many times one was opened, and a fake Cloud Connect that records each
 * Report. Its router and control socket are real, on a port and a runtime
 * folder of the test's own, and so are its Plugins: a tiny one that answers
 * `ping`.
 */

export const PING = fileURLToPath(new URL('./ping.mjs', import.meta.url));
export const KEY = 'k3y_-secret';

/** A Release of the ping Plugin on a folder Shelf: one file that runs PING from where it is, and its `file:` URL. */
export const release = (variant = '') => {
  const content = `${variant}await import(${JSON.stringify(pathToFileURL(PING).href)});\n`;
  const hash = createHash('sha256').update(content).digest('hex');
  const file = join(folder(), `${hash}.mjs`);
  writeFileSync(file, content);
  return { hash, url: pathToFileURL(file).href };
};

const made: Array<string> = [];
afterEach(() => {
  for (const folder of made.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
export const folder = () => {
  const at = mkdtempSync(join(tmpdir(), 'connect-'));
  made.push(at);
  return at;
};

/** What a Connection stands on outside itself, faked. */
export interface Host {
  readonly cloud: Cloud['Service'];
  readonly tunnels: Tunnels['Service'];
}

export const fake = (options: {
  readonly healthy: (url: string) => boolean;
  readonly answer?: (status: ConnectionStatus, count: number) => Reported;
  readonly signInAgain?: Effect.Effect<void, string>;
  readonly backoff?: Duration.Input;
  /** How getting cloudflared goes; at once unless given. */
  readonly cloudflared?: Effect.Effect<string, Error>;
}) => {
  const opened: Array<string> = [];
  const closed: Array<string> = [];
  const ports: Array<number> = [];
  const reports: Array<ConnectionStatus> = [];
  const plugins: Array<Readonly<Record<string, PluginState>>> = [];
  const signIns: Array<number> = [];
  const tunnels = Tunnels.of({
    cloudflared: options.cloudflared ?? Effect.succeed('/bin/cloudflared'),
    open: (port) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const url = `https://t${opened.length + 1}.example`;
          opened.push(url);
          ports.push(port);
          return { url, closed: Effect.never };
        }),
        ({ url }) => Effect.sync(() => void closed.push(url)),
      ),
    check: (url: string) =>
      Effect.succeed({
        ok: options.healthy(url),
        at: Date.now(),
        problem: options.healthy(url) ? null : 'down',
      }),
  });
  const cloud = Cloud.of({
    every: '10 millis',
    report: (report) =>
      Effect.sync(() => {
        reports.push(report.status);
        plugins.push(report.plugins);
        return (
          options.answer?.(report.status, reports.length) ?? {
            _tag: 'Reported',
            wanted: {},
          }
        );
      }),
    backoff: options.backoff ?? '10 millis',
    signInAgain: Effect.suspend(() => {
      signIns.push(Date.now());
      return options.signInAgain ?? Effect.void;
    }),
  });
  const host: Host = { cloud, tunnels };
  return {
    host,
    opened,
    closed,
    ports,
    reports,
    plugins,
    signIns: () => signIns.length,
    signedInAt: signIns,
  };
};

/** The Input of a Connection with folders of its own. */
export const inputOf = () => {
  const root = folder();
  const runtime = folder();
  const socketId = 'c0ffee00';
  return {
    id: 'connection-1',
    name: 'test',
    key: KEY,
    folders: {
      data: join(root, 'data'),
      state: join(root, 'state'),
      cache: join(root, 'cache'),
      runtime,
    },
    socketId,
    control: socketPath(runtime, socketId, 'connect'),
    port: 0,
    origins: ['http://localhost:*', 'https://*.app.test'],
    lastWanted: {} as Record<string, { hash: string; url: string }>,
  };
};

/** Runs a Connection on `host` until it ends, for as long as the Scope: how it ended, and its root. */
export const start = (
  host: Host,
  input: ReturnType<typeof inputOf> = inputOf(),
) =>
  Effect.gen(function* () {
    const running = yield* Runtime.start(
      History.make(ActorConnection, { window: 0, input }),
      Layer.mergeAll(
        Layer.succeed(Cloud, host.cloud),
        Layer.succeed(Tunnels, host.tunnels),
        Downloads.layer(input.folders.cache),
      ),
    );
    const root = () => running.instance({ from: 'test' });
    const ended = running.changes.pipe(
      Stream.map(() => root().state),
      Stream.merge(Stream.sync(() => root().state)),
      Stream.filter(
        (state) => state._tag === 'Forgotten' || state._tag === 'Stopped',
      ),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    );
    return { ended, root, input };
  });

/** Runs a Connection on `host` until it ends: how it ended. */
export const runToEnd = (host: Host) =>
  Effect.scoped(Effect.flatMap(start(host), ({ ended }) => ended));

export const eventually = (assertion: () => void, timeout = 5_000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout, interval: 10 }));

/** How a WebSocket to the router at `path`, with the key, closed: its code and reason. */
export const closeOf = (port: number, path: string) =>
  new Promise<{ code: number; reason: string }>((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, [
      'ke-connect',
      `key.${KEY}`,
    ]);
    socket.onclose = ({ code, reason }) => resolve({ code, reason });
  });

/** How the router answers a plain GET at `path`, with the key: its status and body. */
export const get = (port: number, path: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const asking = request({
      host: '127.0.0.1',
      port,
      path,
      agent: false,
      headers: { 'sec-websocket-protocol': `ke-connect, key.${KEY}` },
    });
    asking.on('response', (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, body }),
      );
    });
    asking.on('error', reject);
    asking.end();
  });

/** How the router answers a WebSocket upgrade at `path`: 101, or its refusal. */
export const upgrade = (
  port: number,
  path: string,
  headers: Record<string, string> = {},
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
        ...headers,
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

export const withKey = { 'sec-websocket-protocol': `ke-connect, key.${KEY}` };
