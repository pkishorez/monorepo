import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  query,
  type Options,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { Duration, Effect, Layer } from 'effect';
import {
  failureReason,
  HarnessAccount,
  HarnessError,
  OneShotPrompt,
} from '../../contract/index.js';
import { executable } from '../catalog/index.js';

/*
 * One-shot Prompts answered by Claude Code: one turn of the Agent SDK's
 * `query`, with no tools, no MCP servers, no settings read from disk and
 * a short system prompt in place of Claude Code's own, so little but the
 * prompt reaches the model. It runs in a temp folder removed after, and
 * keeps no session.
 */

/** The small, fast model `claudeOneShot` runs. */
const SMALL_MODEL = 'claude-haiku-5-5';
const ONE_SHOT_TIMEOUT: Duration.Input = '30 seconds';

const SYSTEM_PROMPT =
  'You answer one prompt, in plain text, with no tools. Reply with the ' +
  'answer alone.';

const tempFolder = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => mkdtemp(join(tmpdir(), 'ai-toolkit-claude-one-shot-')),
    catch: (cause) =>
      new HarnessError({
        message: 'No temp folder for the One-shot Prompt',
        cause,
      }),
  }),
  (folder) =>
    Effect.promise(() => rm(folder, { recursive: true, force: true })),
);

/** The reply a result holds, or why it holds none. */
const toReply = (result: SDKResultMessage): string | HarnessError => {
  if (result.subtype !== 'success')
    return new HarnessError({
      message:
        result.errors.length > 0 ? result.errors.join('\n') : result.subtype,
    });
  if (result.is_error) return new HarnessError({ message: result.result });
  return result.result.trim();
};

const prompt = (
  text: string,
  model: string | undefined,
  timeout: Duration.Input,
) =>
  Effect.gen(function* () {
    // The caller's Harness Account when it gives one, else the installed Claude Code.
    const account = yield* Effect.serviceOption(HarnessAccount).pipe(
      Effect.map((found) =>
        found._tag === 'Some'
          ? found.value
          : { binary: undefined, configFolder: undefined },
      ),
    );
    const launch = yield* executable.pipe(
      Effect.provideService(HarnessAccount, account),
    );
    const cwd = yield* tempFolder;
    const options = (abortController: AbortController): Options => ({
      cwd,
      pathToClaudeCodeExecutable: launch.path,
      env: launch.env,
      ...(model === undefined ? {} : { model }),
      systemPrompt: SYSTEM_PROMPT,
      settingSources: [],
      tools: [],
      strictMcpConfig: true,
      maxTurns: 1,
      persistSession: false,
      abortController,
    });
    const result = yield* Effect.tryPromise({
      try: async (signal) => {
        const abort = new AbortController();
        signal.addEventListener('abort', () => abort.abort());
        let last: SDKResultMessage | undefined;
        for await (const message of query({
          prompt: text,
          options: options(abort),
        }))
          if (message.type === 'result') last = message;
        return last;
      },
      catch: (cause) =>
        new HarnessError({
          message: failureReason(
            cause,
            { harness: 'Claude Code', cwd, binary: launch.path },
            existsSync,
          ),
          cause,
        }),
    });
    if (result === undefined)
      return yield* new HarnessError({ message: 'Claude Code gave no answer' });
    const reply = toReply(result);
    return typeof reply === 'string' ? reply : yield* reply;
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () =>
        Effect.fail(
          new HarnessError({ message: 'Claude Code took too long to answer' }),
        ),
    }),
  );

/**
 * One-shot Prompts answered by Claude Code on `model`, the account's
 * default when undefined, failing after `timeout`, 30 seconds unless given.
 */
export const claudeOneShotWith = (options: {
  readonly model?: string | undefined;
  readonly timeout?: Duration.Input | undefined;
}): Layer.Layer<OneShotPrompt> =>
  Layer.succeed(OneShotPrompt, {
    prompt: (text) =>
      prompt(text, options.model, options.timeout ?? ONE_SHOT_TIMEOUT),
  });

/** One-shot Prompts answered by Claude Code on a small, fast model. */
export const claudeOneShot = claudeOneShotWith({ model: SMALL_MODEL });
