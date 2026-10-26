import { Clock, Effect, Schema } from 'effect';
import { type Raw, TURN_END_STATUSES } from '@kestack/ai-toolkit/contract';
import type { Session } from '../../records/index.js';
import { Store } from '../capabilities/index.js';
import { EngineRaw } from '../engine-raw/index.js';
import type { Loaded } from './actor.js';

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
 * `interrupted`, until its next message resumes the agent by its native
 * id. Nothing is restarted on its own.
 */

const TurnEnded = Schema.Struct({ status: Schema.Literals(TURN_END_STATUSES) });

/** How a session's last turn ended, if its last Raw says so. */
const endedBy = (last: Raw | null) => {
  if (last?.harness !== 'engine' || last.kind !== 'turn.ended') return null;
  const ended = Schema.decodeUnknownOption(TurnEnded)(last.payload);
  return ended._tag === 'Some' ? ended.value.status : null;
};

const swept = (session: Session) =>
  Effect.gen(function* () {
    if (session.status !== 'running') return session;
    const store = yield* Store;
    const last = yield* store.lastRaw(session.id);
    // Ended already, and stopped before the session was saved idle.
    const ended = endedBy(last);
    if (last !== null && ended !== null) {
      const saved: Session = {
        ...session,
        status: ended === 'done' ? 'idle' : ended,
        endedAt: last.at,
      };
      yield* store.saveSession(saved);
      return saved;
    }
    const raw =
      last === null
        ? null
        : yield* EngineRaw.stamp(
            { sessionId: session.id, turnId: last.turnId, harness: 'engine' },
            EngineRaw.turnEnded('interrupted'),
          );
    if (raw !== null) yield* store.appendRaw(raw);
    const saved: Session = {
      ...session,
      status: 'interrupted',
      endedAt: raw?.at ?? (yield* Clock.currentTimeMillis),
    };
    yield* store.saveSession(saved);
    yield* Effect.logWarning(
      `Session ${session.id} was cut off by the server stopping; marked interrupted`,
    );
    return saved;
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
        .filter((session) => session.projectId === project.id)
        .map((session) => ({ session, cwd: project.path, first: null })),
    ),
  } satisfies Loaded;
});
