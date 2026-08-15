import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { makeFileCommand } from './file/index.js';
import { makeLayerCommand } from './layer/index.js';
import { makeModuleCommand } from './module/index.js';
import { makeProjectCommand } from './project/index.js';

export function makeInspectCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('inspect', {}, () => Effect.void).pipe(
    Command.withDescription('Inspect a Project, Layer, file, or Module.'),
    Command.withSubcommands([
      makeProjectCommand(configPath),
      makeLayerCommand(configPath),
      makeFileCommand(configPath),
      makeModuleCommand(configPath),
    ]),
  );
}
