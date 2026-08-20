import { Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { makeSnapshotCommand } from './snapshot/index.js';

const rootCommand = Command.make('std-toolkit', {}, () => Effect.void).pipe(
  Command.withSharedFlags({
    cwd: Flag.string('cwd').pipe(
      Flag.withDefault(process.cwd()),
      Flag.withDescription(
        'Project directory holding std-toolkit.snapshot.ts.',
      ),
    ),
  }),
);

const cwd = rootCommand.pipe(Effect.map(({ cwd }) => cwd));

export const cli = rootCommand.pipe(
  Command.withSubcommands([makeSnapshotCommand(cwd)]),
  Command.run({ version: '0.0.6' }),
);
