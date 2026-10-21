import { Effect, Schema } from 'effect';
import type { ProjectInput } from './project/index.js';
import { TURN_END_STATUSES } from '../projection/index.js';
import type { Raw } from '../raw/index.js';
import type { Session } from '../records/index.js';
import { Store } from '../store/index.js';
import { EngineRaw } from './engine-raw/index.js';

/*
 * What the engine starts from: every project and its sessions, as the
 * Store holds them. A session still `running` was cut off when the server
 * last stopped, cleanly or not: a stop writes nothing, so this is the one
 * place that finds it. Its turn gets `turn.ended { interrupted }` and the
 * session is `interrupted`, until its next message resumes the agent by its
 * native id. Nothing is restarted on its own.
 */

const TurnEnded = Schema.Struct({ status: Schema.Literals(TURN_END_STATUSES) });

/** How a session's last turn ended, if its last Raw says so. */
const endedBy = (last: Raw | null) => {
  if (last?.harness !== 'engine' || last.kind !== 'turn.ended') return null;
  const ended = Schema.decodeUnknownOption(TurnEnded)(last.payload);
  return ended._tag === 'Some' ? ended.value.status : null;
};

const sweep = (session: Session) =>
  Effect.gen(function* () {
    if (session.status !== 'running') return session;
    const store = yield* Store;
    const last = yield* store.lastRaw(session.id);
    // Ended already, and stopped before the session was saved idle.
    const ended = endedBy(last);
    if (ended !== null) {
      const swept: Session = {
        ...session,
        status: ended === 'done' ? 'idle' : ended,
      };
      yield* store.saveSession(swept);
      return swept;
    }
    if (last !== null) {
      const raw = yield* EngineRaw.stamp(
        { sessionId: session.id, turnId: last.turnId, harness: 'engine' },
        EngineRaw.turnEnded('interrupted'),
      );
      yield* store.appendRaw(raw);
    }
    const swept: Session = { ...session, status: 'interrupted' };
    yield* store.saveSession(swept);
    yield* Effect.logWarning(
      `Session ${session.id} was cut off by the server stopping; marked interrupted`,
    );
    return swept;
  });

export const bootstrap = Effect.gen(function* () {
  const store = yield* Store;
  const sessions = yield* Effect.forEach(yield* store.allSessions, sweep);
  const projects = yield* store.allProjects;
  return projects.map((project): ProjectInput => ({
    project,
    sessions: sessions
      .filter((session) => session.projectId === project.id)
      .map((session) => ({ session, first: null })),
  }));
});
