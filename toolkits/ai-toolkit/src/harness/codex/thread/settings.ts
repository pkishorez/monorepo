import type { Setting } from '../../contract/index.js';
import type {
  ReasoningEffort,
  SandboxMode,
  SandboxPolicy,
} from '../app-server/index.js';

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

export const SETTINGS: ReadonlyArray<Setting> = [reasoningEffort, sandbox];

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

export interface ThreadOptions {
  readonly effort: ReasoningEffort;
  readonly sandbox: SandboxMode;
}

/** The thread options a set of Setting values asks for. */
export const threadOptions = (
  settings: Readonly<Record<string, string>>,
): ThreadOptions => ({
  effort: choose(reasoningEffort, settings),
  sandbox: choose(sandbox, settings),
});

/** `turn/start` takes a sandbox as a policy, not a mode. */
export const sandboxPolicy = (mode: SandboxMode): SandboxPolicy => {
  switch (mode) {
    case 'danger-full-access':
      return { type: 'dangerFullAccess' };
    case 'read-only':
      return { type: 'readOnly', networkAccess: false };
    case 'workspace-write':
      return {
        type: 'workspaceWrite',
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
  }
};
