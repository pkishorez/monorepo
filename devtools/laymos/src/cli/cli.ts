#!/usr/bin/env node
import { Effect } from 'effect';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';

import { CruiserLive } from '../services/file-cruiser/index.js';
import { cli } from './run.js';

cli.pipe(
  Effect.provide(NodeServices.layer),
  Effect.provide(CruiserLive),
  NodeRuntime.runMain(),
);
