import type { CanUseTool, Options } from '@anthropic-ai/claude-agent-sdk';
import { Effect } from 'effect';
import { ASK_USER_QUESTION, type Questions } from './questions/index.js';
import type { TurnOptions } from './turn-options.js';

export interface SdkAgentConfig extends TurnOptions {
  readonly cwd: string;
  readonly nativeId?: string;
  /** The Claude Code to run, and the environment it runs in. */
  readonly executable: {
    readonly path: string;
    readonly env: NodeJS.ProcessEnv;
  };
}

/** Every tool may run; an Agent Question waits for the user's answer. */
const canUseTool =
  (questions: Questions): CanUseTool =>
  async (toolName, input, { signal, toolUseID }) =>
    toolName === ASK_USER_QUESTION
      ? Effect.runPromise(questions.ask(toolUseID, input, signal))
      : { behavior: 'allow', updatedInput: input };

/** The live query's options, for a prompt fed one user message at a time. */
export const queryOptions = (
  config: SdkAgentConfig,
  questions: Questions,
): Options => ({
  cwd: config.cwd,
  pathToClaudeCodeExecutable: config.executable.path,
  env: config.executable.env,
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
  // Claude Code asks it for `AskUserQuestion` even under bypass, though
  // the SDK warns it never will.
  canUseTool: canUseTool(questions),
});
