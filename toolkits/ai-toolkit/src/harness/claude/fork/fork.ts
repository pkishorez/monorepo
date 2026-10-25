import { execFile } from 'node:child_process';
import { Effect } from 'effect';
import {
  HarnessError,
  type AskAnswer,
  type AskInput,
  type ForkInput,
} from '../../contract/index.js';
import { askOptions, runAsk, toAnswer } from './ask.js';
import { readTranscript, resolveEntry } from './transcript.js';

/** The Claude Code to run, and the environment it runs in. */
interface Launch {
  readonly path: string;
  readonly env: NodeJS.ProcessEnv;
  /** Its config folder; undefined for Claude Code's own default. */
  readonly home: string | undefined;
}

/*
 * The SDK's `forkSession` runs in this process and finds transcripts from
 * this process's `CLAUDE_CONFIG_DIR`. Each Harness Account has its own, so
 * it runs in a Node child given the account's environment instead.
 */
const FORK_SCRIPT = `
const [sdk, sessionId, options] = process.argv.slice(1);
const { forkSession } = await import(sdk);
const forked = await forkSession(sessionId, JSON.parse(options));
process.stdout.write(JSON.stringify(forked));
`;

const forkSession = (
  sessionId: string,
  options: { readonly dir: string; readonly upToMessageId?: string },
  env: NodeJS.ProcessEnv,
) =>
  Effect.callback<{ readonly sessionId: string }, HarnessError>((resume) => {
    const child = execFile(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        FORK_SCRIPT,
        import.meta.resolve('@anthropic-ai/claude-agent-sdk'),
        sessionId,
        JSON.stringify(options),
      ],
      { env },
      (error, stdout, stderr) =>
        resume(
          error === null
            ? Effect.succeed(JSON.parse(stdout) as { sessionId: string })
            : Effect.fail(
                new HarnessError({
                  message: 'Claude Code did not fork',
                  cause: stderr.trim() || error,
                }),
              ),
        ),
    );
    return Effect.sync(() => void child.kill());
  });

/**
 * Copies a session's transcript into a new session, up to the Fork Point's
 * entry when one is given. The Fork Point may have been recorded in a
 * session this one was forked from.
 */
export const fork = (
  input: ForkInput,
  executable: Launch,
): Effect.Effect<{ readonly nativeId: string }, HarnessError> =>
  Effect.gen(function* () {
    const read = (sessionId: string) =>
      readTranscript(sessionId, executable.home);
    const upTo =
      input.at === undefined
        ? undefined
        : resolveEntry(input.nativeId, input.at, read);
    if (input.at !== undefined && upTo === undefined) {
      return yield* Effect.fail(
        new HarnessError({
          message: `No entry ${input.at} in session ${input.nativeId} to fork at`,
        }),
      );
    }
    const forked = yield* forkSession(
      input.nativeId,
      {
        dir: input.cwd,
        ...(upTo === undefined ? {} : { upToMessageId: upTo }),
      },
      executable.env,
    );
    return { nativeId: forked.sessionId };
  });

/** Answers a question from a session's context in a fork never kept. */
export const ask = (
  input: AskInput,
  executable: Launch,
): Effect.Effect<AskAnswer, HarnessError> =>
  Effect.tryPromise({
    try: (signal) => {
      const abort = new AbortController();
      signal.addEventListener('abort', () => abort.abort());
      return runAsk(input, askOptions(input, executable, abort));
    },
    catch: (cause) =>
      new HarnessError({ message: 'Claude Code did not answer', cause }),
  }).pipe(
    Effect.flatMap((result) => {
      const answer = toAnswer(result, input.schema !== undefined);
      return typeof answer === 'string'
        ? Effect.fail(new HarnessError({ message: answer }))
        : Effect.succeed(answer);
    }),
  );
