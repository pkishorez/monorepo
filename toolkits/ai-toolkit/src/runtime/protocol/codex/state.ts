import type { RunInput } from '../shared.js';

export const CODEX_MODELS = [
  'gpt-6-astra',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.3-codex',
] as const;

export interface CodexRunInput extends RunInput {
  readonly options: {
    readonly reasoningEffort?:
      | 'minimal'
      | 'low'
      | 'medium'
      | 'high'
      | 'xhigh'
      | undefined;
    readonly approvalPolicy?: 'untrusted' | 'on-request' | 'never' | undefined;
    readonly sandbox?:
      | 'read-only'
      | 'workspace-write'
      | 'danger-full-access'
      | undefined;
    readonly requestTimeoutMs?: number | undefined;
  };
}
