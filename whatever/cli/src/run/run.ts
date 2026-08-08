import { Command } from 'effect/unstable/cli';

import { serveCommand } from './serve-command.ts';

const codeCommand = Command.make('code').pipe(
  Command.withSubcommands([serveCommand]),
);

const command = Command.make('whatever').pipe(
  Command.withSubcommands([codeCommand]),
);

export const cli = command.pipe(Command.run({ version: '0.0.1' }));
