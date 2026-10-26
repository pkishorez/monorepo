import { isAbsolute, resolve } from 'node:path';
import { Config, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';

/*
 * `ke-connect`'s commands: their flags and arguments, and nothing else.
 * What each does is handed in. `serve [name]` runs a Connection, `list`
 * shows every Connection on this computer, and `remove <name>` deletes
 * one. With no command it opens Effect CLI's wizard, which builds one and
 * runs it. A failure ends the program with its message alone.
 */

const DEFAULT_NAME = 'main';
const DEFAULT_CLOUD = 'https://connect.kishore.app';
const DEFAULT_HEARTBEAT = 15;

/** What `serve` is asked to do. */
export interface ServeFlags {
  /** The Connection's name on this computer. */
  readonly name: string;
  /** The public port, which only the tunnel uses; 0 for any free one. */
  readonly port: number;
  /** Cloud Connect's base URL. */
  readonly cloud: string;
  /** Origins a browser page may call from, besides the stack's own. */
  readonly origins: ReadonlyArray<string>;
  /** Seconds between Heartbeats. */
  readonly heartbeat: number;
  /** In development: a Plugin to run from a file, by name. */
  readonly plugins: Readonly<Record<string, string>>;
}

/** What each command does. */
export interface Commands {
  readonly serve: (flags: ServeFlags) => Effect.Effect<void, unknown>;
  readonly list: () => Effect.Effect<void, unknown>;
  readonly remove: (name: string) => Effect.Effect<void, unknown>;
}

const name = Argument.String('name').pipe(
  Argument.withDescription(
    `The Connection's name on this computer; ${DEFAULT_NAME} unless given`,
  ),
  Argument.withDefault(DEFAULT_NAME),
);

const port = Flag.Int('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription(
    'The port the tunnel points at; any free port unless given',
  ),
  Flag.withDefault(0),
);

const cloud = Flag.String('cloud').pipe(
  Flag.withDescription(
    `Cloud Connect; KE_CONNECT_CLOUD, else ${DEFAULT_CLOUD}`,
  ),
  Flag.withFallbackConfig(Config.String('KE_CONNECT_CLOUD')),
  Flag.withDefault(DEFAULT_CLOUD),
);

const origin = Flag.String('origin').pipe(
  Flag.withDescription(
    'Another origin a browser page may call from, such as https://*.example.ts.net:*; repeatable',
  ),
  Flag.atLeast(0),
);

const heartbeat = Flag.Int('heartbeat').pipe(
  Flag.withDescription(
    `Seconds between Heartbeats; ${DEFAULT_HEARTBEAT} unless given`,
  ),
  Flag.withDefault(DEFAULT_HEARTBEAT),
);

const plugin = Flag.String('plugin').pipe(
  Flag.withDescription(
    'For development: run a Plugin from a file, as name=<file>, whatever Cloud Connect wants; repeatable',
  ),
  Flag.atLeast(0),
);

/** `name=<file>` as a name and an absolute file. */
const pluginsOf = (given: ReadonlyArray<string>) =>
  Effect.forEach(given, (each) => {
    const at = each.indexOf('=');
    return at <= 0 || at === each.length - 1
      ? Effect.fail(new Error(`--plugin ${each} is not name=<file>`))
      : Effect.succeed([
          each.slice(0, at),
          isAbsolute(each.slice(at + 1))
            ? each.slice(at + 1)
            : resolve(each.slice(at + 1)),
        ] as const);
  }).pipe(Effect.map(Object.fromEntries<string>));

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

/** `ke-connect` and its commands, each doing what `commands` says. */
const root = (commands: Commands) =>
  Command.make('ke-connect').pipe(
    Command.withDescription(
      'Connects this computer to the cloud as Connections its User reaches from anywhere',
    ),
    Command.withSubcommands([
      Command.make(
        'serve',
        { name, port, cloud, origin, heartbeat, plugin },
        ({ origin, plugin, ...flags }) =>
          pluginsOf(plugin).pipe(
            Effect.flatMap((plugins) =>
              commands.serve({ ...flags, origins: origin, plugins }),
            ),
            Effect.catch(exitWith),
          ),
      ).pipe(
        Command.withDescription(
          'Run a Connection: signed in, tunnelled, running its Plugins and reporting its Heartbeat',
        ),
      ),
      Command.make('list', {}, () =>
        commands.list().pipe(Effect.catch(exitWith)),
      ).pipe(
        Command.withDescription(
          'Every Connection on this computer: whether it runs, its address and its last start',
        ),
      ),
      Command.make('remove', { name: Argument.String('name') }, ({ name }) =>
        commands.remove(name).pipe(Effect.catch(exitWith)),
      ).pipe(
        Command.withDescription(
          'Stop a Connection, forget it in Cloud Connect, sign it out and delete its files',
        ),
      ),
    ]),
  );

/** Runs `ke-connect` on this process's arguments until it ends; with none, its wizard. */
export const run = (commands: Commands, version: string) => {
  const args = process.argv.slice(2);
  return Command.runWith(root(commands), { version })(
    args.length === 0 ? ['--wizard'] : args,
  ).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
};
