import { Effect } from 'effect';
import { Command, Flag } from 'effect/cli';

import { makeInspectCommand } from './inspect/inspect.js';
import { makeLintCommand } from './lint/lint.js';
import { makeStoriesCommand } from './stories/stories.js';
import { skillsCommand } from './skills.js';

const rootCommand = Command.make('laymos', {}, () => Effect.void).pipe(
  Command.withSharedFlags({
    config: Flag.String('config').pipe(
      Flag.withDefault('laymos.config.json'),
      Flag.withDescription(
        'Config file path. Project paths are relative to its directory.',
      ),
    ),
  }),
);

const configPath = rootCommand.pipe(Effect.map(({ config }) => config));

export const cli = rootCommand.pipe(
  Command.withSubcommands([
    makeInspectCommand(configPath),
    makeLintCommand(configPath),
    makeStoriesCommand(configPath),
    skillsCommand,
  ]),
  Command.run({ version: '0.0.1' }),
);
