import { readFileSync } from 'node:fs';
import { Config, Effect, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import {
  logout as logoutMachine,
  serve as serveMachine,
} from '../serve/index.js';

/*
 * `ke-connect`: the flags, and nothing else. `serve` runs Connect as a
 * Machine and `logout` forgets it, both from src/serve; a failure ends the
 * program with its message alone.
 */

const DEFAULT_PORT = 4590;
const DEFAULT_CLOUD = 'https://connect.kishore.app';
const DEFAULT_HEARTBEAT = 15;

const port = Flag.Int('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription(
    'Port to listen on; PORT, else 4590; 0 for any free port',
  ),
  Flag.withFallbackConfig(Config.Int('PORT')),
  Flag.withDefault(DEFAULT_PORT),
);

const cloud = Flag.String('cloud').pipe(
  Flag.withDescription(
    `Cloud Connect; KE_CONNECT_CLOUD, else ${DEFAULT_CLOUD}`,
  ),
  Flag.withFallbackConfig(Config.String('KE_CONNECT_CLOUD')),
  Flag.withDefault(DEFAULT_CLOUD),
);

const branch = Flag.String('branch').pipe(
  Flag.withDescription(
    'For development: the branch whose own folders and Machine to use; KESTACK_BRANCH',
  ),
  Flag.withFallbackConfig(Config.String('KESTACK_BRANCH')),
  Flag.optional,
);

const origin = Flag.String('origin').pipe(
  Flag.withDescription(
    'Another origin a browser page may call from, such as https://*.example.ts.net:*; repeatable',
  ),
  Flag.atLeast(0),
);

const name = Flag.String('name').pipe(
  Flag.withDescription(
    "This Machine's name, kept for later runs; the host's name at first",
  ),
  Flag.optional,
);

const heartbeat = Flag.Int('heartbeat').pipe(
  Flag.withDescription(
    `Seconds between Heartbeats; ${DEFAULT_HEARTBEAT} unless given`,
  ),
  Flag.withDefault(DEFAULT_HEARTBEAT),
);

/** What went wrong, down every cause, such as a port already in use under a failed serve. */
const reasonOf = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause === undefined ? '' : reasonOf(error.cause);
  return [error.message, cause].filter((part) => part !== '').join(': ');
};

/** Ends the program with `error`'s message alone, and a failing exit code. */
const exitWith = (error: unknown) =>
  Effect.sync(() => {
    process.stderr.write(`${reasonOf(error)}\n`);
    process.exitCode = 1;
  });

const serve = Command.make(
  'serve',
  { port, cloud, branch, origin, name, heartbeat },
  ({ port, cloud, branch, origin, name, heartbeat }) =>
    serveMachine({
      cloud,
      port,
      ...Option.match(branch, {
        onNone: () => ({}),
        onSome: (branch) => ({ branch }),
      }),
      ...Option.match(name, {
        onNone: () => ({}),
        onSome: (name) => ({ name }),
      }),
      origins: origin,
      heartbeat,
    }).pipe(Effect.catch(exitWith)),
).pipe(
  Command.withDescription(
    'Run Connect as a Machine: signed in, tunnelled and reporting its Heartbeat',
  ),
);

const logout = Command.make('logout', { cloud, branch }, ({ cloud, branch }) =>
  logoutMachine({
    cloud,
    ...Option.match(branch, {
      onNone: () => ({}),
      onSome: (branch) => ({ branch }),
    }),
  }).pipe(Effect.catch(exitWith)),
).pipe(
  Command.withDescription(
    'Sign out and forget this Machine, keeping its Projects and Sessions',
  ),
);

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly version: string };

Command.make('ke-connect', {}, () => Effect.void).pipe(
  Command.withSubcommands([serve, logout]),
  Command.run({ version }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
