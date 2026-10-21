import { tmpdir } from 'node:os';
import { query, type Query } from '@anthropic-ai/claude-agent-sdk';
import { Duration, Effect } from 'effect';
import { HarnessError } from '../../../harness/index.js';

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
 * never sent a message, asked, then closed. No API call is made.
 */
export const askIdle = <A>(
  options: { readonly cwd?: string; readonly executable: string | undefined },
  what: string,
  ask: (live: Query) => Promise<A>,
): Effect.Effect<A, HarnessError> =>
  Effect.acquireRelease(
    Effect.try({
      try: () => {
        const input = silence();
        return {
          input,
          live: query({
            prompt: input.iterable,
            options: {
              cwd: options.cwd ?? tmpdir(),
              ...(options.executable === undefined
                ? {}
                : { pathToClaudeCodeExecutable: options.executable }),
            },
          }),
        };
      },
      catch: (cause) =>
        new HarnessError({ message: 'Claude Code did not start', cause }),
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
        catch: (cause) =>
          new HarnessError({
            message: `Claude Code did not list ${what}`,
            cause,
          }),
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
