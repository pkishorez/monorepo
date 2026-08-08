import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { makeFileCommand } from './file/index.js';
import { makeModuleCommand } from './module/index.js';

export function makeInspectCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('inspect', {}, () => Effect.void).pipe(
    Command.withDescription('Inspect a file or Configured Module.'),
    Command.withSubcommands([
      makeFileCommand(configPath),
      makeModuleCommand(configPath),
    ]),
  );
}
