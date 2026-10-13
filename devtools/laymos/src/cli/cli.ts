#!/usr/bin/env node
import { Effect } from 'effect';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';

import { renderOperationalError } from './errors.js';
import { cli } from './run.js';

cli.pipe(
  Effect.provide(NodeServices.layer),
  Effect.catch((error) =>
    Effect.sync(() => {
      console.error(renderOperationalError(error));
      process.exitCode = 2;
    }),
  ),
  // Every command is done once it returns, but a Proof can leave a timer, a
  // socket, or a fiber running. runMain only exits on failure, so exit here
  // once the output has flushed.
  Effect.andThen(Effect.promise(flushOutput)),
  Effect.andThen(Effect.sync(() => process.exit(process.exitCode ?? 0))),
  NodeRuntime.runMain(),
);

function flushOutput(): Promise<void> {
  return new Promise((resolve) =>
    process.stdout.write('', () => process.stderr.write('', () => resolve())),
  );
}
