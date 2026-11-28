import { Config, Effect, type Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';

export const OUTDATED_EXIT = 75;

const DEFAULT_NAME = 'main';
const DEFAULT_CLOUD = 'https://connect.kishore.app';
const DEFAULT_HEARTBEAT = 15;

const name = Argument.String('name').pipe(
  Argument.withDescription(
    `The Connection's name on this computer; ${DEFAULT_NAME} unless given`,
  ),
  Argument.withDefault(DEFAULT_NAME),
);

const port = Flag.Int('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription(
    'The local port the tunnel points at; any free port unless given',
  ),
  Flag.withDefault(0),
);

const cloud = Flag.String('cloud').pipe(
  Flag.withDescription(
    `Connect Cloud; KE_CONNECT_CLOUD, else ${DEFAULT_CLOUD}`,
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

const devtools = Flag.String('devtools').pipe(
  Flag.withDescription(
    'A DevTools Server to show this Connection in, such as http://127.0.0.1:14400; KE_DEVTOOLS, else none',
  ),
  Flag.withFallbackConfig(Config.String('KE_DEVTOOLS')),
  Flag.optional,
);

const deleteData = Flag.Boolean('delete-data').pipe(
  Flag.withDescription("Also delete every Plugin's data; kept unless given"),
  Flag.withDefault(false),
);

const reasonOf = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause === undefined ? '' : reasonOf(error.cause);
  return [error.message, cause].filter((part) => part !== '').join(': ');
};

const exitCodeOf = (error: unknown): number => {
  const code = (error as { readonly exitCode?: unknown } | null)?.exitCode;
  return typeof code === 'number' ? code : 1;
};

const exitWith = (error: unknown) =>
  Effect.sync(() => {
    process.stderr.write(`${reasonOf(error)}\n`);
    process.exitCode = exitCodeOf(error);
  });

const root = (commands: Commands) =>
  Command.make('ke-connect').pipe(
    Command.withDescription(
      'Connects this computer to the cloud, so its User reaches it from anywhere',
    ),
    Command.withSubcommands([
      Command.make(
        'serve',
        { name, port, cloud, origin, heartbeat, devtools },
        ({ origin: origins, ...flags }) =>
          commands.serve({ ...flags, origins }).pipe(Effect.catch(exitWith)),
      ).pipe(
        Command.withDescription(
          'Run a Connection: signed in, reachable through its tunnel, reporting its Heartbeat and running its Plugins',
        ),
      ),
      Command.make('list', {}, () =>
        commands.list().pipe(Effect.catch(exitWith)),
      ).pipe(
        Command.withDescription(
          'Every Connection on this computer: whether it runs, its address and its last start',
        ),
      ),
      Command.make('stop', { name }, ({ name: stopped }) =>
        commands.stop(stopped).pipe(Effect.catch(exitWith)),
      ).pipe(Command.withDescription('Stop a running Connection')),
      Command.make(
        'remove',
        { name: Argument.String('name'), deleteData },
        ({ name: removed, deleteData: everything }) =>
          commands.remove(removed, everything).pipe(Effect.catch(exitWith)),
      ).pipe(
        Command.withDescription(
          "Stop a Connection, remove it from Connect Cloud, sign it out and delete its files, keeping its Plugins' data",
        ),
      ),
    ]),
  );

export const run = (commands: Commands, version: string) => {
  const args = process.argv.slice(2);
  return Command.runWith(root(commands), { version })(
    args.length === 0 ? ['--help'] : args,
  ).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
};

export interface ServeFlags {
  readonly name: string;
  readonly port: number;
  readonly cloud: string;
  readonly origins: ReadonlyArray<string>;
  readonly heartbeat: number;
  readonly devtools: Option.Option<string>;
}
export interface Commands {
  readonly serve: (flags: ServeFlags) => Effect.Effect<void, unknown>;
  readonly list: () => Effect.Effect<void, unknown>;
  readonly stop: (name: string) => Effect.Effect<void, unknown>;
  readonly remove: (
    name: string,
    deleteData: boolean,
  ) => Effect.Effect<void, unknown>;
}
