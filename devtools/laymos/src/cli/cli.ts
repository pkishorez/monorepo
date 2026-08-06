#!/usr/bin/env node
import { Effect } from 'effect';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';

import { CruiserLive } from '../services/file-cruiser/index.js';
import { ConfigServiceLive } from '../services/config/index.js';
import { renderOperationalError } from './errors.js';
import { cli } from './run.js';

cli.pipe(
  Effect.provide(ConfigServiceLive),
  Effect.provide(CruiserLive),
  Effect.provide(NodeServices.layer),
  Effect.catch((error) =>
    Effect.sync(() => {
      console.error(renderOperationalError(error));
      process.exitCode = 2;
    }),
  ),
  NodeRuntime.runMain(),
);
