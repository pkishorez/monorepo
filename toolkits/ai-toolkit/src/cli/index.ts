#!/usr/bin/env node
import { Config, Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { PLAYGROUND_HOST, PLAYGROUND_PORT } from '../runtime/constants.js';
import { makePlaygroundServer } from './playground-server.js';

const VERSION = '0.0.1';

const port = Flag.integer('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription('Port to listen on'),
  Flag.withFallbackConfig(Config.int('PORT')),
  Flag.withDefault(PLAYGROUND_PORT),
);

const serve = Command.make(
  'serve',
  { port },
  Effect.fn(function* ({ port }) {
    console.log(`ai-toolkit listening on http://${PLAYGROUND_HOST}:${port}`);
    yield* Effect.never.pipe(Effect.provide(makePlaygroundServer(port)));
  }),
).pipe(Command.withDescription('Run the AI Toolkit playground server'));

Command.make('ai-toolkit', {}, () => Effect.void).pipe(
  Command.withSubcommands([serve]),
  Command.run({ version: VERSION }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
