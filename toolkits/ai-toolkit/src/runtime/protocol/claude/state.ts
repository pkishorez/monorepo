import type { RunInput } from '../shared.js';

export const CLAUDE_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const;

export interface ClaudeRunInput extends RunInput {
  readonly options: {
    readonly thinking?: { readonly budgetTokens: number } | undefined;
    readonly permissionMode?:
      | 'default'
      | 'acceptEdits'
      | 'bypassPermissions'
      | 'dontAsk'
      | 'auto'
      | undefined;
    readonly allowDangerouslySkipPermissions?: boolean | undefined;
    readonly maxTurns?: number | undefined;
    readonly permissionTimeoutMs?: number | undefined;
  };
}
