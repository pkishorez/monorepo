import type { CanUseTool, Options } from '@anthropic-ai/claude-agent-sdk';
import type { TurnOptions } from './turn-options.js';

export interface SdkAgentConfig extends TurnOptions {
  readonly cwd: string;
  readonly nativeId?: string;
  /** The Claude Code to run; undefined runs the SDK's bundled one. */
  readonly executable: string | undefined;
}

const canUseTool: CanUseTool = async (toolName, input) =>
  toolName === 'AskUserQuestion'
    ? { behavior: 'deny', message: 'Questions are not supported here.' }
    : { behavior: 'allow', updatedInput: input };

/** The live query's options, for a prompt fed one user message at a time. */
export const queryOptions = (config: SdkAgentConfig): Options => ({
  cwd: config.cwd,
  ...(config.executable === undefined
    ? {}
    : { pathToClaudeCodeExecutable: config.executable }),
  model: config.model,
  effort: config.effort,
  permissionMode: config.permissionMode,
  // Token deltas, batched into a few sentences per text.chunk record.
  includePartialMessages: true,
  // A later Turn may switch to bypass, which must be allowed from the start.
  allowDangerouslySkipPermissions: true,
  ...(config.nativeId === undefined ? {} : { resume: config.nativeId }),
  // Background Jobs get their own stop button, so cancelling a Turn spares
  // them.
  perTaskStopAffordance: true,
  disallowedTools: ['AskUserQuestion'],
  // Under bypass Claude Code never asks it, and the SDK warns so; a later
  // Turn may switch to a mode that does.
  canUseTool,
});
