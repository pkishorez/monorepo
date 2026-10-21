import type {
  EffortLevel,
  PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';
import type { Setting } from '../../harness/index.js';

const EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies ReadonlyArray<EffortLevel>;
const PERMISSION_MODES = [
  'bypassPermissions',
  'acceptEdits',
  'plan',
] as const satisfies ReadonlyArray<PermissionMode>;

const effort: Setting = {
  key: 'effort',
  label: 'Effort',
  choices: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'Extra high' },
    { value: 'max', label: 'Max' },
  ],
  default: 'high',
};

const permissionMode: Setting = {
  key: 'permissionMode',
  label: 'Permissions',
  choices: [
    { value: 'bypassPermissions', label: 'Bypass permissions' },
    { value: 'acceptEdits', label: 'Accept edits' },
    { value: 'plan', label: 'Plan only' },
  ],
  default: 'bypassPermissions',
};

export const SETTINGS: ReadonlyArray<Setting> = [effort, permissionMode];

const pick = <T extends string>(
  choices: ReadonlyArray<T>,
  value: string | undefined,
  fallback: T,
): T => choices.find((choice) => choice === value) ?? fallback;

/** The Settings' values, each unknown or missing one at its default. */
export const readSettings = (values: Readonly<Record<string, string>>) => ({
  effort: pick(EFFORTS, values['effort'], 'high'),
  permissionMode: pick(
    PERMISSION_MODES,
    values['permissionMode'],
    'bypassPermissions',
  ),
});
