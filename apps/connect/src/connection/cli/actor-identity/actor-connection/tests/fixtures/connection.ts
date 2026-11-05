import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Duration, Effect, Layer } from 'effect';
import { afterEach, vi } from 'vitest';
import { History, Runtime } from '@kestack/kabuki';
import { Downloads, socketPath } from '@kestack/cli-platform/files';
import type {
  ConnectionStatus,
  Release,
} from '../../../../../../contract/index.js';
import { Cloud } from '../../../capabilities/index.js';
import { ActorConnection, ROTATE_EVERY, Tunnels } from '../../index.js';

/*
 * A Connection, against a fake tunnel, whose addresses are numbered by how many
 * times one was opened, and a fake Connect Cloud that records each Report. Its
 * server is real, on a port of the test's own, and so are its Plugins: a tiny
 * one that answers `ping`.
 */

export const PING = fileURLToPath(new URL('./ping.mjs', import.meta.url));

/** A Release of the ping Plugin, its file in a folder: one file that runs PING from where it is, and its `file:` URL. */
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
  /** What a Report is answered with: the Releases to run, or null when it was not taken; none to run unless given. */
  readonly answer?: (
    status: ConnectionStatus,
    count: number,
  ) => Readonly<Record<string, Release>> | null;
  /** How getting cloudflared goes; at once unless given. */
  readonly cloudflared?: Tunnels['Service']['cloudflared'];
  /** How long a download goes between telling how far it came; 50 ms unless given. */
  readonly downloadEvery?: Duration.Input;
  /** A tunnel that never opens, to stay SettingUp. */
  readonly neverOpens?: boolean;
  /** How long between Heartbeats; 10 ms unless given. */
  readonly every?: Duration.Input;
}) => {
  const opened: Array<string> = [];
  const closed: Array<string> = [];
  const ports: Array<number> = [];
  const reports: Array<ConnectionStatus> = [];
  const keys: Array<string> = [];
  const tunnels = Tunnels.of({
    cloudflared:
      options.cloudflared ?? (() => Effect.succeed('/bin/cloudflared')),
    downloadEvery: options.downloadEvery ?? '50 millis',
    open: (port) =>
      options.neverOpens
        ? Effect.never
        : Effect.acquireRelease(
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
    every: options.every ?? '10 millis',
    report: (status, key) =>
      Effect.sync(() => {
        reports.push(status);
        keys.push(key);
        return options.answer ? options.answer(status, reports.length) : {};
      }),
  });
  const host: Host = { cloud, tunnels };
  return { host, opened, closed, ports, reports, keys };
};

/** The Input of a Connection with folders of its own. */
export const inputOf = () => {
  const root = folder();
  const runtime = folder();
  const socketId = 'c0ffee00';
  return {
    folders: {
      data: join(root, 'data'),
      state: join(root, 'state'),
      cache: join(root, 'cache'),
      shared: join(root, 'shared'),
      runtime,
    },
    socketId,
    control: socketPath(runtime, socketId, 'connect'),
    port: 0,
    origins: ['http://localhost:*', 'https://*.app.test'],
    rotateEvery: ROTATE_EVERY,
  };
};

/** Runs a Connection on `host`, for as long as the Scope. */
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
    /** The port and the key now; it must be Listening. */
    const listening = () => {
      const { state } = root();
      if (state._tag !== 'Listening') throw new Error('It is not Listening');
      return state;
    };
    /** The Tunnel now, as the Snapshot holds it; it must be Listening. */
    const tunnel = () => running.snapshot().children['tunnel'];
    /** The id of each Plugin Child now. */
    const pluginIds = () => {
      const plugins = running.snapshot().children['plugins'];
      return Array.isArray(plugins) ? plugins.map(({ id }) => id) : [];
    };
    /** Sends a Message to the Connection's Tunnel. */
    const sendTunnel = (message: Parameters<typeof running.send>[1]) =>
      running.send(`${running.snapshot().id}/tunnel#1`, message);
    return {
      running,
      root,
      listening,
      tunnel,
      pluginIds,
      sendTunnel,
      input,
    };
  });

export const eventually = (assertion: () => void, timeout = 5_000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout, interval: 10 }));

/** The subprotocols a caller offers with `key`. */
export const withKey = (key: string) => ({
  'sec-websocket-protocol': `ke-connect, key.${key}`,
});

/** How a WebSocket to the server at `path`, with `key`, closed: its code and reason. */
export const closeOf = (port: number, path: string, key: string) =>
  new Promise<{ code: number; reason: string }>((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, [
      'ke-connect',
      `key.${key}`,
    ]);
    socket.onclose = ({ code, reason }) => resolve({ code, reason });
  });

/** How the server answers a plain GET at `path`, with these headers: its status and body. */
export const get = (
  port: number,
  path: string,
  headers: Record<string, string> = {},
) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const asking = request({
      host: '127.0.0.1',
      port,
      path,
      agent: false,
      headers,
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

/** How the server answers a WebSocket upgrade at `path`: 101, or its refusal. */
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
