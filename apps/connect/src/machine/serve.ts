import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { Context, Effect, Layer } from 'effect';
import { HttpServer } from 'effect/http';
import {
  claude,
  codex,
  codexOneShot,
  harnesses,
  type Harnesses,
  type OneShotPrompt,
} from '@kestack/ai-toolkit/harness';
import type { SpeechToText } from '@kestack/ai-toolkit/speech';
import { codeGroup } from './code/index.js';
import { identify, logout as forgetMachine, online } from './online/index.js';
import { type ConnectPaths, moveLegacy, resolvePaths } from './paths/index.js';
import { DEFAULT_ORIGINS, server } from './server/index.js';
import { logsTo } from './logs.js';

/*
 * `ke-connect serve`: the composition root. Connect's files in its XDG
 * folders (a branch's own in development), moved there once from
 * ~/.ai-toolkit on the first production run; Claude and Codex as the
 * harnesses, Codex writing titles; and the code App Group on the Machine's
 * one socket, ws://127.0.0.1:<port>/rpc, for pages on this computer and every App's
 * address, plus any origin given.
 *
 * Serving is also being a Machine: signed in to Cloud Connect, the one
 * Machine its machine.json is, asking callers for its Machine Key, and
 * reachable through a tunnel its Heartbeat reports. `logout` signs out and
 * forgets the Machine.
 */

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4590;
const DEFAULT_HEARTBEAT = 15;

/** This Connect's version, as it reports itself. */
const version = (
  JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { readonly version: string }
).version;

const defaultHarnesses = Layer.merge(harnesses([claude, codex]), codexOneShot);

export interface ServeOptions {
  /** Cloud Connect's base URL. */
  readonly cloud: string;
  /** The port to listen on; 4590 unless given, and 0 for any free port. */
  readonly port?: number;
  /** In development: the branch whose own folders and Machine to use. */
  readonly branch?: string;
  /** Renames the Machine, kept for later runs. */
  readonly name?: string;
  /** Origins a browser page may call from, besides DEFAULT_ORIGINS. */
  readonly origins?: ReadonlyArray<string>;
  /** Seconds between Heartbeats; 15 unless given. */
  readonly heartbeat?: number;
  /** For tests: where the files go, instead of the XDG folders. */
  readonly paths?: ConnectPaths;
  /** For tests: fake harnesses; Claude and Codex, Codex answering One-shot Prompts, unless given. */
  readonly harnesses?: Layer.Layer<Harnesses | OneShotPrompt>;
  /** For tests: fake Speech to Text; sherpa-onnx unless given. */
  readonly speech?: Layer.Layer<SpeechToText>;
  /** Called once the socket is bound, with the port it is bound to. */
  readonly onListening?: (info: {
    readonly port: number;
    readonly machine: { readonly id: string; readonly name: string };
  }) => Effect.Effect<void>;
}

/** The paths given, else the XDG ones for `branch`; fails on a bad branch. */
const pathsOf = (options: {
  readonly branch?: string | undefined;
  readonly paths?: ConnectPaths | undefined;
}) =>
  options.paths === undefined
    ? Effect.try({
        try: () => resolvePaths({ branch: options.branch }),
        catch: (error) => error,
      })
    : Effect.succeed(options.paths);

/** Makes `folder` if it is missing, readable by this user alone. */
const ownFolder = (folder: string) =>
  Effect.sync(() => {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    chmodSync(folder, 0o700);
  });

/**
 * Readies the data folder, 0700, first moving ~/.ai-toolkit's files into
 * it on a production run: one whose paths serve resolved itself, with no
 * branch, never one given paths.
 */
const ownData = (
  options: {
    readonly branch?: string | undefined;
    readonly paths?: ConnectPaths | undefined;
  },
  paths: ConnectPaths,
) =>
  Effect.gen(function* () {
    if (options.branch === undefined && options.paths === undefined)
      yield* moveLegacy(paths);
    yield* ownFolder(paths.data);
  });

/** Keeps the database 0600 once it is there. */
const ownDb = (paths: ConnectPaths) =>
  Effect.sync(() => {
    if (existsSync(paths.db)) chmodSync(paths.db, 0o600);
  });

/**
 * Runs Connect until it is stopped or the Machine must stop: signed in,
 * serving the API, tunnelled and reporting its Heartbeat. It logs to the
 * console and to `paths.log`.
 */
export const serve = (options: ServeOptions) =>
  Effect.gen(function* () {
    const paths = yield* pathsOf(options);
    yield* ownFolder(paths.state);
    yield* Effect.gen(function* () {
      yield* ownData(options, paths);

      const identified = yield* identify({
        cloud: options.cloud,
        db: paths.db,
        machineFile: paths.machine,
        version,
        name: options.name,
        firstName:
          options.branch === undefined
            ? undefined
            : `${hostname()} (${options.branch})`,
      });
      const { machine, user } = identified;
      // Signing in opened the database first.
      yield* ownDb(paths);

      const listening = yield* Layer.build(
        server({
          port: options.port ?? DEFAULT_PORT,
          host: HOST,
          groups: [
            codeGroup({
              db: paths.db,
              attachments: paths.attachments,
              modelsCache: paths.ai.models,
              speechFolder: paths.ai.speech,
              harnesses: options.harnesses ?? defaultHarnesses,
              ...(options.speech === undefined
                ? {}
                : { speech: options.speech }),
            }),
          ],
          origins: [...DEFAULT_ORIGINS, ...(options.origins ?? [])],
          key: machine.key,
        }),
      );
      const { address } = Context.get(listening, HttpServer.HttpServer);
      const port =
        'port' in address ? address.port : (options.port ?? DEFAULT_PORT);

      yield* Effect.log(`ke-connect ${version} on ws://${HOST}:${port}/rpc`);
      yield* Effect.log(`data in ${paths.data}`);
      yield* Effect.log(`Machine ${machine.name} (${machine.id})`);
      yield* Effect.log(`signed in as ${user.email} to ${options.cloud}`);
      if (options.onListening)
        yield* options.onListening({
          port,
          machine: { id: machine.id, name: machine.name },
        });

      return yield* online(identified, {
        port,
        every: options.heartbeat ?? DEFAULT_HEARTBEAT,
        cloudflared: paths.cloudflared,
      });
    }).pipe(Effect.provide(logsTo(paths.log)));
  }).pipe(Effect.scoped);

/**
 * Signs out of Cloud Connect and forgets this Machine (a branch's, given
 * `branch`), keeping its Projects and Sessions: the next serve is a new
 * Machine. Before a first serve, it readies the folders as serve would,
 * so the database it opens is the one moved from ~/.ai-toolkit.
 */
export const logout = (options: {
  readonly cloud: string;
  readonly branch?: string;
  readonly paths?: ConnectPaths;
}) =>
  Effect.gen(function* () {
    const paths = yield* pathsOf(options);
    yield* ownData(options, paths);
    yield* forgetMachine({
      cloud: options.cloud,
      db: paths.db,
      machineFile: paths.machine,
      version,
    });
    yield* ownDb(paths);
    yield* Effect.log(
      `Signed out and forgot this Machine; ${paths.data} keeps its Projects and Sessions, and the next serve is a new Machine.`,
    );
  });
