import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { hello } from '@pkishorez/code';

const codeCommand = Command.make('code', {}, () =>
  Effect.sync(() => {
    process.stdout.write('Hello whatever code!\n');
  }),
);

const rootCommand = Command.make('whatever', {}, () =>
  Effect.sync(() => {
    process.stdout.write(`${hello('world')}\n`);
  }),
);

const command = rootCommand.pipe(Command.withSubcommands([codeCommand]));

export const cli = command.pipe(Command.run({ version: '0.0.1' }));
