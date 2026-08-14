import { Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { makeInspectCommand } from './inspect/index.js';
import { makeLintCommand } from './lint/index.js';
import { makeStoriesCommand } from './stories/index.js';

const rootCommand = Command.make('laymos', {}, () => Effect.void).pipe(
  Command.withSharedFlags({
    config: Flag.string('config').pipe(
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
  ]),
  Command.run({ version: '0.0.1' }),
);
