import { Effect, Struct } from 'effect';
import type { ProjectInput } from './project/index.js';
import { Store } from '../store/index.js';
import { EngineRaw } from './engine-raw/index.js';

/*
 * What the engine starts from: every project and its sessions, as the
 * Store holds them. A session still `running` was cut off when the server
 * last stopped: its turn gets `turn.ended { cancelled }` and it goes idle.
 * Its next message resumes the agent by its native id.
 */
export const bootstrap = Effect.gen(function* () {
  const store = yield* Store;
  const sessions = yield* store.allSessions;
  for (const session of sessions) {
    if (session.status !== 'running') continue;
    const last = yield* store.lastRaw(session.id);
    const ended = last?.harness === 'engine' && last.kind === 'turn.ended';
    if (last !== null && !ended) {
      const raw = yield* EngineRaw.stamp(
        { sessionId: session.id, turnId: last.turnId, harness: 'engine' },
        EngineRaw.turnEnded('cancelled'),
      );
      yield* store.appendRaw(raw);
    }
    yield* store.saveSession({ ...session, status: 'idle' });
  }

  const projects = yield* store.allProjects;
  return projects.map((project): ProjectInput => ({
    project,
    sessions: sessions
      .filter((session) => session.projectId === project.id)
      .map((session) => ({
        session: Struct.omit(session, ['status']),
        first: null,
      })),
  }));
});
