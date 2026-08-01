import type {
  ClaudeCodeModel,
  ClaudeCodeTextProviderOptions,
} from '@tanstack/ai-claude-code';
import type { CodexModel, CodexTextProviderOptions } from '@tanstack/ai-codex';
import type { Run } from './schema/index.js';

type CodexRunOptions = Omit<
  CodexTextProviderOptions,
  'sessionId' | 'workingDirectory'
>;

type ClaudeCodeRunOptions = Omit<
  ClaudeCodeTextProviderOptions,
  'sessionId' | 'forkSession' | 'cwd'
>;

export type RunConfigurationInput =
  | {
      _tag: 'Codex';
      model: CodexModel;
      modelOptions: CodexRunOptions;
    }
  | {
      _tag: 'ClaudeCode';
      model: ClaudeCodeModel;
      modelOptions: ClaudeCodeRunOptions;
    };

export const toPersistedConfiguration = (
  input: RunConfigurationInput,
): Run['configuration'] =>
  input._tag === 'Codex'
    ? {
        _tag: 'Codex',
        model: input.model,
        modelOptions: {
          sandboxMode: input.modelOptions.sandboxMode ?? null,
          approvalPolicy: input.modelOptions.approvalPolicy ?? null,
          modelReasoningEffort: input.modelOptions.modelReasoningEffort ?? null,
          skipGitRepoCheck: input.modelOptions.skipGitRepoCheck ?? null,
        },
      }
    : {
        _tag: 'ClaudeCode',
        model: input.model,
        modelOptions: {
          maxTurns: input.modelOptions.maxTurns ?? null,
          permissionMode: input.modelOptions.permissionMode ?? null,
          allowedTools: input.modelOptions.allowedTools ?? [],
          disallowedTools: input.modelOptions.disallowedTools ?? [],
        },
      };
