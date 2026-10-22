import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Config, Effect, Layer, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Harnesses } from '../harness/index.js';
import { claude } from '../harnesses/claude/index.js';
import { codex, codexTitler } from '../harnesses/codex/index.js';
import { identify, logout as forgetMachine, online } from '../machine/index.js';
import { DEFAULT_ORIGINS, server } from './server/index.js';

/*
 * `ai-toolkit serve`: the composition root. Claude and Codex as the
 * harnesses, Codex writing titles, the database at ~/.ai-toolkit/ai.db
 * unless told otherwise, Attachments under ~/.ai-toolkit/attachments, and
 * the API at ws://127.0.0.1:<port>/rpc for pages on this machine and the
 * app's own address, plus any `--origin` given.
 *
 * Serving is also being a Machine: signed in to the Machines Backend, the
 * one Machine its database file is, asking callers for its Machine Key, and
 * reachable through a tunnel its Heartbeat reports. `ai-toolkit logout`
 * signs out and forgets the Machine.
 */

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4590;
const DEFAULT_BACKEND = 'https://api-code.kishore.app';
const DEFAULT_HEARTBEAT = 15;
const HOME = join(homedir(), '.ai-toolkit');
const DEFAULT_DB = join(HOME, 'ai.db');
const ATTACHMENTS = join(HOME, 'attachments');

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly version: string };

const all = [claude, codex];
const harnesses = Layer.merge(
  Layer.succeed(Harnesses, {
    all,
    get: (name) => {
      const found = all.find((harness) => harness.name === name);
      if (!found) throw new Error(`No harness named ${name}`);
      return found;
    },
  }),
  codexTitler,
);

const port = Flag.Int('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription('Port to listen on; PORT, else 4590'),
  Flag.withFallbackConfig(Config.Int('PORT')),
  Flag.withDefault(DEFAULT_PORT),
);

const db = Flag.String('db').pipe(
  Flag.withDescription('The SQLite database file'),
  Flag.withDefault(DEFAULT_DB),
);

const origin = Flag.String('origin').pipe(
  Flag.withDescription(
    'Another origin a browser page may call from, such as https://*.example.ts.net:*; repeatable',
  ),
  Flag.atLeast(0),
);

const backend = Flag.String('backend').pipe(
  Flag.withDescription(
    `The Machines Backend; AI_TOOLKIT_BACKEND, else ${DEFAULT_BACKEND}`,
  ),
  Flag.withFallbackConfig(Config.String('AI_TOOLKIT_BACKEND')),
  Flag.withDefault(DEFAULT_BACKEND),
);

const as = Flag.String('as').pipe(
  Flag.withDescription('The email to act as, for a Backend in Local mode only'),
  Flag.optional,
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

/** Ends the program with `error`'s message alone, and a failing exit code. */
const exitWith = (error: unknown) =>
  Effect.sync(() => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });

const serve = Command.make(
  'serve',
  { port, db, origin, backend, as, name, heartbeat },
  Effect.fn(function* ({ port, db, origin, backend, as, name, heartbeat }) {
    mkdirSync(dirname(db), { recursive: true });
    yield* Effect.gen(function* () {
      const identified = yield* identify({
        backend,
        db,
        version,
        as: Option.getOrUndefined(as),
        name: Option.getOrUndefined(name),
      });
      const { machine, user } = identified;
      yield* Effect.log(`ai-toolkit ${version} on ws://${HOST}:${port}/rpc`);
      yield* Effect.log(`database ${db}`);
      yield* Effect.log(`Machine ${machine.name} (${machine.id})`);
      yield* Effect.log(`signed in as ${user.email} to ${backend}`);
      yield* Effect.raceFirst(
        Layer.launch(
          server({
            port,
            host: HOST,
            db,
            attachments: ATTACHMENTS,
            harnesses,
            origins: [...DEFAULT_ORIGINS, ...origin],
            key: machine.key,
          }),
        ),
        online(identified, { port, every: heartbeat }),
      );
    }).pipe(Effect.scoped, Effect.catch(exitWith));
  }),
).pipe(
  Command.withDescription(
    'Run the ai-toolkit server as a Machine: signed in, tunnelled and reporting its Heartbeat',
  ),
);

const logout = Command.make(
  'logout',
  { db, backend },
  Effect.fn(function* ({ db, backend }) {
    yield* forgetMachine({ backend, db, version }).pipe(
      Effect.andThen(
        Effect.log(
          `Signed out and forgot this Machine; ${db} keeps its Projects and Sessions, and the next serve is a new Machine.`,
        ),
      ),
      Effect.catch(exitWith),
    );
  }),
).pipe(
  Command.withDescription(
    'Sign out and forget this Machine, keeping its Projects and Sessions',
  ),
);

Command.make('ai-toolkit', {}, () => Effect.void).pipe(
  Command.withSubcommands([serve, logout]),
  Command.run({ version }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
