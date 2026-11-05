import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Duration, Effect, Layer, Option, Stream } from 'effect';
import { afterEach, vi } from 'vitest';
import { History, Runtime } from '@kestack/kabuki';
import { Downloads, socketPath } from '@kestack/cli-platform/files';
import {
  addressOf,
  type ConnectionStatus,
} from '../../../../../contract/index.js';
import { Control, hold, Tunnels } from '../../actor-connection/index.js';
import { ActorIdentity } from '../../actor.js';
import { CloudAccount, type Reported } from '../../capabilities/index.js';

/*
 * The whole tree, against a fake account on Connect Cloud that records each
 * Sign-in and Report, and a fake tunnel whose addresses are numbered by how
 * many times one was opened. Its Plugins are real: a tiny one that answers
 * `ping`.
 */

const PING = fileURLToPath(
  new URL('../../actor-connection/tests/fixtures/ping.mjs', import.meta.url),
);

const made: Array<string> = [];
afterEach(() => {
  for (const folder of made.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
const folder = () => {
  const at = mkdtempSync(join(tmpdir(), 'connect-'));
  made.push(at);
  return at;
};

/** A Release of the ping Plugin, its file in a folder. */
export const release = () => {
  const content = `await import(${JSON.stringify(pathToFileURL(PING).href)});\n`;
  const hash = createHash('sha256').update(content).digest('hex');
  const file = join(folder(), `${hash}.mjs`);
  writeFileSync(file, content);
  return { hash, url: pathToFileURL(file).href };
};

export const fake = (options: {
  /** What a Report is answered with; taken, with nothing to run, unless given. */
  readonly answer?: (status: ConnectionStatus, count: number) => Reported;
  /** How the first Sign-in goes. */
  readonly identify?: Effect.Effect<{ id: string; key: string }, string>;
  /** How signing in again goes. */
  readonly signInAgain?: Effect.Effect<void, string>;
  readonly backoff?: Duration.Input;
}) => {
  const opened: Array<string> = [];
  const closed: Array<string> = [];
  const reports: Array<ConnectionStatus> = [];
  const signIns: Array<number> = [];
  const account = CloudAccount.of({
    identify:
      options.identify ?? Effect.succeed({ id: 'connection-1', key: 'k3y' }),
    signInAgain: Effect.suspend(() => {
      signIns.push(Date.now());
      return options.signInAgain ?? Effect.void;
    }),
    backoff: options.backoff ?? '10 millis',
    every: '10 millis',
    report: (status) =>
      Effect.sync(() => {
        reports.push(status);
        return (
          options.answer?.(status, reports.length) ?? {
            _tag: 'Reported',
            wanted: {},
          }
        );
      }),
  });
  const tunnels = Tunnels.of({
    cloudflared: Effect.succeed('/bin/cloudflared'),
    open: () =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const url = `https://t${opened.length + 1}.example`;
          opened.push(url);
          return { url, closed: Effect.never };
        }),
        ({ url }) => Effect.sync(() => void closed.push(url)),
      ),
    check: () => Effect.succeed({ ok: true, at: Date.now(), problem: null }),
  });
  return {
    account,
    tunnels,
    opened,
    closed,
    reports,
    signIns: () => signIns.length,
    signedInAt: signIns,
  };
};

/** Whether the address is one of a tunnel, numbered `n`. */
export const reportedFrom = (status: ConnectionStatus, n: number) =>
  addressOf(status) === `https://t${n}.example`;

/** Runs the tree on `host`, for as long as the Scope: how it ended, its root, and its folders. */
export const start = (host: ReturnType<typeof fake>) =>
  Effect.gen(function* () {
    const root = folder();
    const runtime = folder();
    const socketId = 'c0ffee00';
    const input = {
      name: 'test',
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
      origins: [],
    };
    const held = yield* hold(input.control, input.name);
    if (held._tag === 'AlreadyRunning')
      return yield* Effect.die(new Error('already running'));
    const running = yield* Runtime.start(
      History.make(ActorIdentity, { window: 0, input }),
      Layer.mergeAll(
        Layer.succeed(CloudAccount, host.account),
        Layer.succeed(Tunnels, host.tunnels),
        Layer.succeed(Control, held.control),
        Downloads.layer(input.folders.cache),
      ),
    );
    const now = () => running.instance({ from: 'test' });
    const ended = running.changes.pipe(
      Stream.map(() => now().state),
      Stream.merge(Stream.sync(() => now().state)),
      Stream.filter(
        (state) => state._tag === 'Forgotten' || state._tag === 'Stopped',
      ),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    );
    return { ended, now, input };
  });

/** Runs the tree on `host` until it ends: how it ended. */
export const runToEnd = (host: ReturnType<typeof fake>) =>
  Effect.scoped(Effect.flatMap(start(host), ({ ended }) => ended));

export const eventually = (assertion: () => void, timeout = 5_000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout, interval: 10 }));
