import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  query,
  type Options,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { Duration, Effect } from 'effect';
import { HarnessError } from '../../contract/index.js';

/** The Claude Code to run, and the environment it runs in. */
export interface Launch {
  readonly path: string;
  readonly env: NodeJS.ProcessEnv;
}

/** Claude Code's alias for its small, fast model. */
const SMALL_MODEL = 'haiku';
const ONE_SHOT_TIMEOUT = Duration.seconds(30);

/**
 * A query with no Agent behind it: the small model, one turn, no tools and
 * no MCP servers, in a folder of its own, never written to disk.
 */
export const oneShotOptions = (
  cwd: string,
  launch: Launch,
  abortController: AbortController,
): Options => ({
  cwd,
  pathToClaudeCodeExecutable: launch.path,
  env: launch.env,
  model: SMALL_MODEL,
  tools: [],
  strictMcpConfig: true,
  persistSession: false,
  maxTurns: 1,
  abortController,
});

/** The reply a result holds, or why it holds none. */
export const replyOf = (
  result: SDKResultMessage | undefined,
): { readonly reply: string } | { readonly why: string } => {
  if (result === undefined) return { why: 'Claude Code gave no result' };
  if (result.subtype !== 'success')
    return {
      why: result.errors.length > 0 ? result.errors.join('\n') : result.subtype,
    };
  if (result.is_error) return { why: result.result };
  return { reply: result.result.trim() };
};

const tempFolder = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => mkdtemp(join(tmpdir(), 'ai-toolkit-one-shot-')),
    catch: (cause) =>
      new HarnessError({
        message: 'No temp folder for the One-shot Prompt',
        cause,
      }),
  }),
  (folder) =>
    Effect.promise(() => rm(folder, { recursive: true, force: true })),
);

const run = async (text: string, options: Options) => {
  let result: SDKResultMessage | undefined;
  for await (const message of query({ prompt: text, options }))
    if (message.type === 'result') result = message;
  return result;
};

/** A One-shot Prompt answered by Claude Code as `launch`. */
export const oneShot = (
  text: string,
  launch: Launch,
): Effect.Effect<string, HarnessError> =>
  Effect.gen(function* () {
    const cwd = yield* tempFolder;
    const result = yield* Effect.tryPromise({
      try: (signal) => {
        const abort = new AbortController();
        signal.addEventListener('abort', () => abort.abort());
        return run(text, oneShotOptions(cwd, launch, abort));
      },
      catch: (cause) =>
        new HarnessError({ message: 'Claude Code did not answer', cause }),
    });
    const read = replyOf(result);
    return 'reply' in read
      ? read.reply
      : yield* new HarnessError({ message: read.why });
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: ONE_SHOT_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new HarnessError({ message: 'Claude Code took too long to answer' }),
        ),
    }),
  );
