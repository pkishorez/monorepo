import type { HarnessName } from '../../contract/raw/index.js';
import type { ModelInfo, Skill } from '../../contract/wire/index.js';
import type { Setting } from '../contract/index.js';

/*
 * What the Agent fake knows of Claude Code and Codex as installed on a
 * computer, copied from the real harnesses (`../claude`, `../codex`),
 * whose own files run only on Node: their Settings, which models.dev ids
 * each accepts, their default models and binaries, and a copy of the
 * models.dev rows and of each login's model list, as they read in late
 * 2026. Change it when the real ones change.
 */

/** What a harness is, as the fake plays it. */
export interface Played {
  readonly name: HarnessName;
  readonly label: string;
  readonly modelsProvider: 'anthropic' | 'openai';
  readonly acceptsModel: (modelId: string) => boolean;
  readonly defaultModel: string;
  readonly settings: ReadonlyArray<Setting>;
  /** Its binary on PATH, as `which` finds it. */
  readonly onPath: string;
  /** What its binary's `--version` prints. */
  readonly version: string;
  /** Its own config folder, under home. */
  readonly own: string;
  /** The login's own models, its default marked. */
  readonly account: ReadonlyArray<{
    readonly id: string;
    readonly isDefault?: boolean;
  }>;
  /** What a turn says when its login is gone. */
  readonly notLoggedIn: string;
}

/** A dated snapshot such as `claude-opus-4-5-20251101` repeats its alias. */
const DATED = /-\d{8}$/;

/** Variants that are not chat-and-tools coding models Codex can drive. */
const NOT_FOR_CODEX =
  /(?:^|-)(?:pro|chat|image|realtime|audio|tts|transcribe|search|embedding)(?:-|$)/;

const EFFORT_CHOICES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' },
];

export const CLAUDE: Played = {
  name: 'claude',
  label: 'Claude',
  modelsProvider: 'anthropic',
  acceptsModel: (modelId) =>
    modelId.startsWith('claude-') && !DATED.test(modelId),
  defaultModel: 'claude-opus-5-5',
  settings: [
    {
      key: 'effort',
      label: 'Effort',
      choices: EFFORT_CHOICES,
      default: 'high',
    },
    {
      key: 'permissionMode',
      label: 'Permissions',
      choices: [
        { value: 'bypassPermissions', label: 'Bypass permissions' },
        { value: 'acceptEdits', label: 'Accept edits' },
        { value: 'plan', label: 'Plan only' },
      ],
      default: 'bypassPermissions',
    },
  ],
  onPath: '/usr/local/bin/claude',
  version: '3.4.12 (Claude Code)',
  own: '.claude',
  account: [
    { id: 'claude-opus-5-5', isDefault: true },
    { id: 'claude-sonnet-5' },
    { id: 'claude-haiku-5-5' },
  ],
  notLoggedIn: 'Not logged in · Please run /login',
};

export const CODEX: Played = {
  name: 'codex',
  label: 'Codex',
  modelsProvider: 'openai',
  acceptsModel: (modelId) => {
    const generation = /^gpt-(\d+)(?:\.\d+)?(?:-|$)/.exec(modelId);
    if (generation === null) return false;
    return Number(generation[1]) >= 5 && !NOT_FOR_CODEX.test(modelId);
  },
  defaultModel: 'gpt-6-astra',
  settings: [
    {
      key: 'reasoningEffort',
      label: 'Reasoning effort',
      choices: EFFORT_CHOICES,
      default: 'medium',
    },
    {
      key: 'sandbox',
      label: 'Sandbox',
      choices: [
        { value: 'danger-full-access', label: 'Full access' },
        { value: 'workspace-write', label: 'Workspace write' },
        { value: 'read-only', label: 'Read only' },
      ],
      default: 'danger-full-access',
    },
  ],
  onPath: '/usr/local/bin/codex',
  version: 'codex-cli 0.154.0',
  own: '.codex',
  account: [
    { id: 'gpt-6-astra', isDefault: true },
    { id: 'gpt-6-sol' },
    { id: 'gpt-6-luna' },
    { id: 'gpt-5.5' },
  ],
  notLoggedIn:
    'unexpected status 401 Unauthorized: Not logged in. Run `codex login`.',
};

export const PLAYED: Readonly<Record<HarnessName, Played>> = {
  claude: CLAUDE,
  codex: CODEX,
};

/** A copy of models.dev's rows for both providers, as `Models` fills a list in. */
export const MODELS_DEV: Readonly<
  Record<Played['modelsProvider'], ReadonlyArray<ModelInfo>>
> = {
  anthropic: [
    {
      id: 'claude-opus-5-5',
      name: 'Claude Opus 5.5',
      releaseDate: '2026-09-24',
    },
    {
      id: 'claude-sonnet-5',
      name: 'Claude Sonnet 5',
      releaseDate: '2026-06-17',
    },
    {
      id: 'claude-haiku-5-5',
      name: 'Claude Haiku 5.5',
      releaseDate: '2026-10-08',
    },
    {
      id: 'claude-opus-4-5',
      name: 'Claude Opus 4.5',
      releaseDate: '2025-11-24',
    },
    {
      id: 'claude-opus-4-5-20251101',
      name: 'Claude Opus 4.5',
      releaseDate: '2025-11-24',
    },
    {
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5',
      releaseDate: '2025-09-29',
    },
    {
      id: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      releaseDate: '2025-10-15',
    },
  ],
  openai: [
    { id: 'gpt-6-astra', name: 'GPT-6 Astra', releaseDate: '2026-10-01' },
    { id: 'gpt-6-sol', name: 'GPT-6 Sol', releaseDate: '2026-10-01' },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna', releaseDate: '2026-10-01' },
    { id: 'gpt-5.5', name: 'GPT-5.5', releaseDate: '2026-04-23' },
    { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro', releaseDate: '2026-04-23' },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', releaseDate: '2026-02-05' },
    { id: 'gpt-4.1', name: 'GPT-4.1', releaseDate: '2025-04-14' },
  ],
};

/** The Skills a harness offers, in every folder. */
export const BUILT_IN_SKILLS: ReadonlyArray<Skill> = [
  { name: 'review', description: 'Reviews the diff', argumentHint: '[focus]' },
  { name: 'explain', description: 'Explains the code' },
];
