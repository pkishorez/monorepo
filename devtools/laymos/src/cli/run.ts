import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { depsCommand } from './deps/index.js';

const rootCommand = Command.make('laymos', {}, () => Effect.void).pipe(
  Command.withSubcommands([depsCommand]),
);

export const cli = rootCommand.pipe(Command.run({ version: '0.0.1' }));
