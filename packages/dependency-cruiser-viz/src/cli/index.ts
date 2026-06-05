#!/usr/bin/env node
import { Effect } from 'effect';
import { NodeRuntime, NodeServices } from '@effect/platform-node';

import { cli } from './run.js';

cli.pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
