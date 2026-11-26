import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Release } from '@kestack/connect-v2-cloud/heartbeat';
import { Plugins } from '../../../../../services/plugins/contract/index.js';

const Input = Schema.Struct({
  name: Schema.String,
  release: Release,
  home: Schema.Struct({
    folders: Schema.Struct({
      data: Schema.String,
      state: Schema.String,
      cache: Schema.String,
    }),
    socket: Schema.String,
    logFile: Schema.String,
  }),
  firstRetryAfter: Schema.Finite,
});

const Log = Schema.Array(Schema.String);

export const PluginShape = Actor.define('Plugin', {
  description:
    'One Plugin at one Release, kept running: started again after a wait that doubles with each crash',
  requires: [Plugins],
  input: Input,
  model: {
    ...Input.fields,
    crashes: Schema.Finite,
    startedAt: Schema.NullOr(Schema.Finite),
  },
  state: {
    Starting: {},
    Running: {},
    Crashed: { retryAt: Schema.Finite, log: Log },
  },
  message: {
    PluginStarted: {},
    PluginStartFailed: { reason: Schema.String, log: Log },
    PluginExited: { code: Schema.NullOr(Schema.Finite), log: Log },
    BackoffEnded: {},
  },
});
