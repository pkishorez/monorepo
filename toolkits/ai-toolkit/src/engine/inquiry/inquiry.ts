import { Data, Duration, Effect } from 'effect';
import type {
  AskAnswer,
  AskInput,
  Harness,
  HarnessBinaries,
  HarnessError,
  HarnessSession,
} from '../../harness/index.js';
import { Store } from '../../store/index.js';
import { EngineRaw } from '../engine-raw/index.js';
import type { LiveAgent } from '../live-agents/index.js';

/*
 * What the engine asks a harness or a Session's agent without changing the
 * Session: an Ask, the Skills in a folder, how the agent stands (MCP Server
 * Status, Context Usage, a Background Job stopped), and the user's latest
 * messages for a new Title. Nothing here is stored.
 */

export class AskFailed extends Data.TaggedError('AskFailed')<{
  readonly message: string;
}> {}
export class SkillsUnavailable extends Data.TaggedError('SkillsUnavailable')<{
  readonly message: string;
}> {}
export class HarnessFailed extends Data.TaggedError('HarnessFailed')<{
  readonly message: string;
}> {}

/** How long a Session's agent may take to register before it counts as gone. */
const AGENT_WAIT = Duration.seconds(5);

/** How many of the user's latest messages a Title is written from. */
const TITLE_MESSAGES = 5;

export const ask = (
  harness: Harness,
  input: Omit<AskInput, 'nativeId'> & { readonly nativeId: string | null },
): Effect.Effect<AskAnswer, AskFailed, HarnessBinaries> => {
  const { nativeId, ...rest } = input;
  if (nativeId === null)
    return Effect.fail(
      new AskFailed({
        message:
          'This session has no context to ask about yet; wait for its first turn to start.',
      }),
    );
  return harness
    .ask({ ...rest, nativeId })
    .pipe(
      Effect.mapError((error) => new AskFailed({ message: error.message })),
    );
};

export const skills = (harness: Harness, cwd: string) =>
  harness
    .skills(cwd)
    .pipe(
      Effect.mapError(
        (error) => new SkillsUnavailable({ message: error.message }),
      ),
    );

const waitFor = <E>(agent: Effect.Effect<LiveAgent, E>) =>
  agent.pipe(
    Effect.timeoutOrElse({
      duration: AGENT_WAIT,
      orElse: () =>
        Effect.fail(
          new HarnessFailed({ message: "The session's agent is not running" }),
        ),
    }),
  );

const failed = (error: HarnessError) =>
  new HarnessFailed({ message: error.message });

/** Asks a Session's agent, opening it if it is not open. */
export const fromAgent = <A, E>(
  agent: Effect.Effect<LiveAgent, E>,
  read: (session: HarnessSession) => Effect.Effect<A, HarnessError>,
): Effect.Effect<A, E | HarnessFailed> =>
  Effect.gen(function* () {
    const live = yield* waitFor(agent);
    const session = yield* Effect.mapError(live.get, failed);
    return yield* Effect.mapError(read(session), failed);
  });

/** Stops one of a Session's Background Jobs; an agent not open has none. */
export const stopJob = <E>(
  agent: Effect.Effect<LiveAgent, E>,
  jobId: string,
): Effect.Effect<void, E | HarnessFailed> =>
  Effect.gen(function* () {
    const session = yield* (yield* waitFor(agent)).opened;
    if (session)
      yield* Effect.mapError(session.stopBackgroundJob(jobId), failed);
  });

/** The user's latest messages in a Session, oldest first, steers included. */
export const recentUserMessages = (sessionId: string) =>
  Effect.gen(function* () {
    const feed = (yield* Store).raws(sessionId);
    const texts: Array<string> = [];
    let cursor: string | null = null;
    while (true) {
      const page: Effect.Success<ReturnType<typeof feed.after>> =
        yield* feed.after(cursor, 500);
      for (const { value } of page.items) {
        const text = EngineRaw.startedOf(value)?.text.trim();
        if (text) texts.push(text);
      }
      if (!page.hasMore || page.items.length === 0)
        return texts.slice(-TITLE_MESSAGES);
      cursor = page.items.at(-1)!.meta._u;
    }
  });
