import {
  query,
  type Options,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { AskAnswer, AskInput } from '../../contract/index.js';
import type { Json } from '../../../contract/raw/index.js';

const ASK_PREAMBLE =
  'A side question about this conversation follows. Answer it from what ' +
  'you already know here. Do not continue or change the task, and do not ' +
  'use any tools.';

/** Structured output gets a few tries to match the schema. */
const SCHEMA_TURNS = 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A throwaway fork of the session: resumed into a new session that is
 * never written to disk, with no tools and no MCP servers, so the original
 * transcript stays as it was and nothing else is touched.
 */
export const askOptions = (
  input: AskInput,
  executable: { readonly path: string; readonly env: NodeJS.ProcessEnv },
  abortController: AbortController,
): Options => ({
  cwd: input.cwd,
  pathToClaudeCodeExecutable: executable.path,
  env: executable.env,
  model: input.model,
  resume: input.nativeId,
  forkSession: true,
  persistSession: false,
  tools: [],
  strictMcpConfig: true,
  maxTurns: input.schema === undefined ? 1 : SCHEMA_TURNS,
  abortController,
  ...(isRecord(input.schema)
    ? { outputFormat: { type: 'json_schema', schema: input.schema } }
    : {}),
});

export const askPrompt = (question: string): string =>
  `${ASK_PREAMBLE}\n\n${question}`;

/** Runs the ask query to its result. */
export const runAsk = async (
  input: AskInput,
  options: Options,
): Promise<SDKResultMessage> => {
  let result: SDKResultMessage | undefined;
  for await (const message of query({
    prompt: askPrompt(input.question),
    options,
  })) {
    if (message.type === 'result') result = message;
  }
  if (result === undefined) throw new Error('Claude Code gave no result');
  return result;
};

/** The answer a result holds, or why it holds none. */
export const toAnswer = (
  result: SDKResultMessage,
  wantsData: boolean,
): AskAnswer | string => {
  if (result.subtype !== 'success') {
    return result.errors.length > 0 ? result.errors.join('\n') : result.subtype;
  }
  if (result.is_error) return result.result;
  if (!wantsData) return { _tag: 'Text', text: result.result };
  if (result.structured_output === undefined) {
    return 'Claude Code gave no answer matching the schema';
  }
  return {
    _tag: 'Data',
    data: JSON.parse(JSON.stringify(result.structured_output)) as Json,
  };
};
