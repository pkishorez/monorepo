import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { query, type Query } from '@anthropic-ai/claude-agent-sdk';
import { Duration, Effect } from 'effect';
import { failureReason, HarnessError } from '../../contract/index.js';

const ASK_TIMEOUT = Duration.seconds(15);

/** A prompt that never yields, until it is closed. */
const silence = () => {
  let close = () => {};
  const closed = new Promise<void>((resolve) => (close = resolve));
  const iterable = async function* (): AsyncGenerator<never> {
    await closed;
  };
  return { iterable: iterable(), close };
};

/**
 * Asks Claude Code something it knows before any turn: a query that is
 * never sent a message, asked, then closed. No API call is made. A refusal
 * says why, as a failed Turn does.
 */
export const askIdle = <A>(
  options: {
    readonly cwd?: string;
    readonly executable: {
      readonly path: string;
      readonly env: NodeJS.ProcessEnv;
    };
  },
  what: string,
  ask: (live: Query) => Promise<A>,
): Effect.Effect<A, HarnessError> =>
  Effect.suspend(() => {
    const cwd = options.cwd ?? tmpdir();
    const why = (cause: unknown) =>
      failureReason(
        cause,
        { harness: 'Claude Code', cwd, binary: options.executable.path },
        existsSync,
      );
    return Effect.acquireRelease(
      Effect.try({
        try: () => {
          const input = silence();
          return {
            input,
            live: query({
              prompt: input.iterable,
              options: {
                cwd,
                pathToClaudeCodeExecutable: options.executable.path,
                env: options.executable.env,
              },
            }),
          };
        },
        catch: (cause) => new HarnessError({ message: why(cause), cause }),
      }),
      ({ input, live }) =>
        Effect.sync(() => {
          input.close();
          live.close();
        }),
    ).pipe(
      Effect.flatMap(({ live }) =>
        Effect.tryPromise({
          try: () => ask(live),
          catch: (cause) => new HarnessError({ message: why(cause), cause }),
        }),
      ),
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: ASK_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new HarnessError({
              message: `Claude Code took too long to list ${what}`,
            }),
          ),
      }),
    );
  });
