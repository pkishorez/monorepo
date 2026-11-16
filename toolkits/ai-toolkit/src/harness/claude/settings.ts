import type {
  EffortLevel,
  PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';
import type { Setting } from '../contract/index.js';
import type { SystemPrompt } from './agent/index.js';

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

/*
 * Which system prompt a Session's Claude Code runs with, set once as it
 * opens: `claude_code`, Claude Code's own, as `claude -p` has it, with its
 * coding, tool and safety guidance; or `minimal`, the Agent SDK's bare one,
 * which covers only tool calling. Claude Code records the prompt on a
 * session's first request and keeps it until compaction, so a Turn cannot
 * change it, and it is no Setting a picker offers: a client sends it with
 * a new Session's settings. Missing or unknown, it is Claude Code's.
 */
const SYSTEM_PROMPTS = [
  'claude_code',
  'minimal',
] as const satisfies ReadonlyArray<SystemPrompt>;

/** The key a Session's settings carry its system prompt under. */
const SYSTEM_PROMPT_KEY = 'systemPrompt';

/** The system prompt `values` ask for, Claude Code's unless they say `minimal`. */
export const readSystemPrompt = (
  values: Readonly<Record<string, string>>,
): SystemPrompt =>
  pick(SYSTEM_PROMPTS, values[SYSTEM_PROMPT_KEY], 'claude_code');
