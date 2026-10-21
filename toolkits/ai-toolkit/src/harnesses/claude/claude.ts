import { Effect } from 'effect';
import { HarnessError, type Harness } from '../../harness/index.js';
import { project } from './project/index.js';
import { openSdkSession, supportedModels } from './sdk-session/index.js';
import { readSettings, SETTINGS } from './settings.js';

const notYet = Effect.fail(new HarnessError({ message: 'not yet' }));

/** A dated snapshot such as `claude-opus-4-5-20251101` repeats its alias. */
const DATED = /-\d{8}$/;

/**
 * Claude Code through the Agent SDK: one streaming-input `query` per open
 * session, steered by pushing more user messages into it.
 */
export const claude: Harness = {
  name: 'claude',
  label: 'Claude',
  modelsProvider: 'anthropic',
  acceptsModel: (modelId) =>
    modelId.startsWith('claude-') && !DATED.test(modelId),
  defaultModel: 'claude-opus-5-5',
  availableModels: supportedModels,
  settings: SETTINGS,
  open: (config) =>
    openSdkSession({
      cwd: config.cwd,
      model: config.model,
      ...readSettings(config.settings),
      ...(config.nativeId === undefined ? {} : { nativeId: config.nativeId }),
    }),
  skills: () => notYet,
  fork: () => notYet,
  ask: () => notYet,
  binary: Effect.succeed({
    path: null,
    version: null,
    error: null,
    isDefault: true,
  }),
  project,
};
