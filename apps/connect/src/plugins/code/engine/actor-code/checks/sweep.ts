import { Clock, Effect, Schema } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/schema';
import { type Raw, TURN_END_STATUSES } from '@kestack/ai-toolkit/contract';
import type { Session } from '../../../records/index.js';
import { Store } from '../../capabilities/index.js';
import { EngineRaw } from '../../engine-raw/index.js';
import {
  cutOffJobs,
  resumePrompt,
  type Prompt,
} from '../actor-session/index.js';

/*
 * The Bootstrap Sweep, run by the root while Loading: every project and
 * its sessions, as the Store holds them.
 *
 * A session whose project is removed is removed too. Removing a project
 * removes its sessions, but a project removed before it did, or a server
 * stopped between the two writes, left them behind.
 *
 * A session still `running` was cut off when the server last stopped,
 * cleanly or not: a stop writes nothing, so this is the one place that
 * finds it. Its turn gets `turn.ended { interrupted }` and the session is
 * `interrupted`. So were the Background Jobs its record still keeps, as
 * the server stopping killed them with its Agent.
 *
 * Then it is Resumed, once: the Session is handed a Prompt that says all
 * that was cut off, as a new Session is handed its first message, and
 * starts a Turn with it once the root is Ready. A Turn that was itself
 * Resumed is not Resumed again, and neither is one whose agent never gave
 * its native id, as there is nothing to continue. A Turn cancelled or
 * failed was not left running, so it is never Resumed for itself. Jobs
 * not Resumed stay in the record, and the next message tells of them.
 */

const TurnEnded = Schema.Struct({ status: Schema.Literals(TURN_END_STATUSES) });

/** How a session's last turn ended, if its last Raw says so. */
const endedBy = (last: Raw | null) => {
  if (last?.harness !== 'engine' || last.kind !== 'turn.ended') return null;
  const ended = Schema.decodeUnknownOption(TurnEnded)(last.payload);
  return ended._tag === 'Some' ? ended.value.status : null;
};

/** Whether a Turn was started by Resuming the one before it. */
const wasResumed = (turn: ReadonlyArray<Raw>) =>
  turn.some((raw) => EngineRaw.startedOf(raw)?.resumed === true);

/** A session as the sweep leaves it, and the Prompt that Resumes it, if any. */
interface Swept {
  readonly session: Session;
  readonly first: Prompt | null;
}

const swept = (session: Session): Effect.Effect<Swept, never, Store> =>
  Effect.gen(function* () {
    const { jobs } = session;
    if (session.status !== 'running' && jobs.length === 0)
      return { session, first: null };
    const store = yield* Store;
    const turn = yield* store.lastTurn(session.id);
    const last = turn.at(-1) ?? null;
    const now = yield* Clock.currentTimeMillis;
    let saved = session;
    let turnCut = false;
    if (session.status === 'running') {
      // Ended already, and stopped before the session was saved idle.
      const ended = endedBy(last);
      if (last !== null && ended !== null)
        saved = {
          ...session,
          status: ended === 'done' ? 'idle' : ended,
          endedAt: last.at,
        };
      else {
        const raw =
          last === null
            ? null
            : yield* EngineRaw.stamp(
                {
                  sessionId: session.id,
                  turnId: last.turnId,
                  harness: 'engine',
                },
                EngineRaw.turnEnded('interrupted'),
              );
        if (raw !== null) yield* store.appendRaw(raw);
        saved = {
          ...session,
          status: 'interrupted',
          endedAt: raw?.at ?? now,
        };
        turnCut = last !== null;
      }
    }
    const cutOff = { turn: turnCut, jobs: cutOffJobs(jobs) };
    const resume =
      (turnCut || jobs.length > 0) &&
      last !== null &&
      session.nativeId !== null &&
      !wasResumed(turn);
    if (resume) saved = { ...saved, jobs: [] };
    yield* store.saveSession(saved);
    if (turnCut || jobs.length > 0)
      yield* Effect.logWarning(
        `Session ${session.id} was cut off by the server stopping (${turnCut ? 'its turn, ' : ''}${jobs.length} background jobs)${resume ? '; resumed' : ''}`,
      );
    if (!resume) return { session: saved, first: null };
    return {
      // Read again: `now` is from before its Turn's end was stamped.
      session: { ...saved, activeAt: yield* Clock.currentTimeMillis },
      first: {
        id: yield* nextUlid,
        text: resumePrompt(cutOff),
        attachments: [],
        resumed: true,
        cutOff,
      },
    };
  });

/** Every Project, and the Sessions in them, swept. */
export const sweep = Effect.gen(function* () {
  const store = yield* Store;
  const projects = yield* store.allProjects;
  const live = new Set(projects.map((project) => project.id));
  const all = yield* store.allSessions;
  for (const session of all)
    if (!live.has(session.projectId)) yield* store.removeSession(session.id);
  const sessions = yield* Effect.forEach(
    all.filter((session) => live.has(session.projectId)),
    swept,
  );
  return {
    projects,
    sessions: projects.flatMap((project) =>
      sessions
        .filter(({ session }) => session.projectId === project.id)
        .map(({ session, first }) => ({
          session,
          cwd: session.worktree ?? project.path,
          first,
        })),
    ),
  };
});
