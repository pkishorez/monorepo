import type {
  ClaudeCodeModel,
  ClaudeCodeTextProviderOptions,
} from '@tanstack/ai-claude-code';
import type { CodexModel, CodexTextProviderOptions } from '@tanstack/ai-codex';
import { fromType } from 'std-toolkit/eschema';

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

export const RunConfigurationInputSchema = fromType<RunConfigurationInput>();
