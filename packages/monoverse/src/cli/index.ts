import { Command, CliConfig } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Console, Effect, Layer } from 'effect';
import { Monoverse } from '../core/index.js';
import {
  tui,
  add,
  remove,
  rm,
  deleteCmd,
  format,
  lint,
} from './commands/index.js';

const monoverse = Command.make('monoverse', {}, () =>
  Console.log('Use --help to see available commands'),
);

const command = monoverse.pipe(
  Command.withSubcommands([tui, add, remove, rm, deleteCmd, format, lint]),
);

const cli = Command.run(command, {
  name: 'monoverse',
  version: 'v0.0.12',
});

const MainLayer = Layer.mergeAll(
  NodeContext.layer,
  Monoverse.Default,
  CliConfig.layer({
    isCaseSensitive: true,
    showBuiltIns: false,
    showTypes: false,
  }),
);

cli(process.argv).pipe(Effect.provide(MainLayer), NodeRuntime.runMain);
