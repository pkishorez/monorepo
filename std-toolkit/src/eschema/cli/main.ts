#!/usr/bin/env node
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';
import { approveCommand } from './approve/index.js';
import { createCommand } from './create/index.js';
import { lintCommand } from './lint/index.js';

const rootCommand = Command.make('eschema', {}, () =>
  Console.log('Use --help to see available commands'),
).pipe(Command.withSubcommands([createCommand, lintCommand, approveCommand]));

Command.run(rootCommand, {
  version: '0.0.1',
}).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
