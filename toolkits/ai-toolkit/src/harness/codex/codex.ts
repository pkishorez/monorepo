import { Effect } from 'effect';
import type { Harness } from '../contract/index.js';
import { start } from './app-server/index.js';
import {
  acceptsModel,
  availableModels,
  binary,
  DEFAULT_MODEL,
  skills,
} from './catalog/index.js';
import { ask, fork } from './fork/index.js';
import { project } from './project/index.js';
import { openSession, SETTINGS, threadOptions } from './thread/index.js';

/**
 * Codex through `codex app-server`: one process per session, approvals
 * never asked (`approvalPolicy: never`, any request answered at once), and
 * every whole record of a turn, sub-agents included, streamed as Raw.
 * Forks, asks and catalog reads each run their own short-lived process.
 */
export const codex: Harness = {
  name: 'codex',
  label: 'Codex',
  modelsProvider: 'openai',
  acceptsModel,
  defaultModel: DEFAULT_MODEL,
  availableModels,
  settings: SETTINGS,
  open: (config) =>
    Effect.gen(function* () {
      const server = yield* start(config.cwd);
      return yield* openSession(server, {
        cwd: config.cwd,
        model: config.model,
        ...threadOptions(config.settings),
        nativeId: config.nativeId,
      });
    }),
  skills,
  fork,
  ask,
  binary,
  project,
};

export { codexOneShot } from './one-shot/index.js';
export { restore, type StreamPointer } from './thread/index.js';
