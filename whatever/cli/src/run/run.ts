import { Effect } from 'effect';
import { Command, CliError } from 'effect/unstable/cli';
import { HttpServerError } from 'effect/unstable/http';

import { serveCommand } from './serve-command.ts';

const codeCommand = Command.make('code').pipe(
  Command.withSubcommands([serveCommand]),
);

const command = Command.make('whatever').pipe(
  Command.withSubcommands([codeCommand]),
);

export const cli: Effect.Effect<
  void,
  Error | HttpServerError.ServeError | CliError.CliError,
  Command.Environment
> = command.pipe(Command.run({ version: '0.0.1' }));
