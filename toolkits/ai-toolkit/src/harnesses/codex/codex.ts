import { Effect } from 'effect';
import {
  HarnessError,
  type Harness,
  type Setting,
} from '../../harness/index.js';
import { start, type SandboxMode } from './app-server/index.js';
import {
  acceptsModel,
  availableModels,
  DEFAULT_MODEL,
} from './catalog/index.js';
import { project } from './project/index.js';
import { openSession } from './thread/index.js';

const notYet = Effect.fail(new HarnessError({ message: 'not yet' }));

const reasoningEffort = {
  key: 'reasoningEffort',
  label: 'Reasoning effort',
  choices: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'Extra high' },
    { value: 'max', label: 'Max' },
  ],
  default: 'medium',
} as const satisfies Setting;

const sandbox = {
  key: 'sandbox',
  label: 'Sandbox',
  choices: [
    { value: 'danger-full-access', label: 'Full access' },
    { value: 'workspace-write', label: 'Workspace write' },
    { value: 'read-only', label: 'Read only' },
  ],
  default: 'danger-full-access',
} as const satisfies Setting;

/** The chosen value of a setting, or its default when missing or unknown. */
const choose = <S extends Setting>(
  setting: S,
  settings: Readonly<Record<string, string>>,
): S['choices'][number]['value'] => {
  const value = settings[setting.key];
  return setting.choices.some((choice) => choice.value === value)
    ? (value as S['choices'][number]['value'])
    : setting.default;
};

/**
 * Codex through `codex app-server`: one process per session, approvals
 * never asked (`approvalPolicy: never`, any request answered at once), and
 * every whole record of a turn, sub-agents included, streamed as Raw.
 */
export const codex: Harness = {
  name: 'codex',
  label: 'Codex',
  modelsProvider: 'openai',
  acceptsModel,
  defaultModel: DEFAULT_MODEL,
  availableModels,
  settings: [reasoningEffort, sandbox],
  open: (config) =>
    Effect.gen(function* () {
      const server = yield* start(config.cwd);
      return yield* openSession(server, {
        cwd: config.cwd,
        model: config.model,
        sandbox: choose(sandbox, config.settings) satisfies SandboxMode,
        effort: choose(reasoningEffort, config.settings),
        nativeId: config.nativeId,
      });
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

export { codexTitler } from './titler/index.js';
export { restore, type StreamPointer } from './thread/index.js';
