import { Effect } from 'effect';
import { Command } from 'effect/cli';

import { makeFileCommand } from './file/file.js';
import { makeModuleCommand } from './module/module.js';
import { makeProjectCommand } from './project/project.js';

export function makeInspectCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('inspect', {}, () => Effect.void).pipe(
    Command.withDescription('Inspect a Project, a Module, or a file.'),
    Command.withSubcommands([
      makeProjectCommand(configPath),
      makeFileCommand(configPath),
      makeModuleCommand(configPath),
    ]),
  );
}
