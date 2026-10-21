import { Effect, Stream, type Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import type { Raw } from '../raw/index.js';
import type { Session } from '../records/index.js';
import { Store } from './index.js';

const run = <A, E>(effect: Effect.Effect<A, E, Store | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(Store.layer(':memory:'))),
  );

const raw = (id: string, sessionId = 's1'): Raw => ({
  id,
  sessionId,
  turnId: 't1',
  harness: 'claude',
  kind: 'text',
  agentId: null,
  payload: { text: id, nested: [1, { deep: true }] },
  at: 1,
});

const session: Session = {
  id: 's1',
  projectId: 'p1',
  harness: 'claude',
  model: 'claude-test',
  settings: { effort: 'high' },
  title: 'Hello',
  status: 'idle',
  nativeId: null,
  createdAt: 1,
};

describe('Store', () => {
  it("reads a session's Raw in write order, after a cursor, page by page", () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        for (const id of ['c', 'a', 'b']) yield* store.appendRaw(raw(id));
        yield* store.appendRaw(raw('x', 's2'));
        const first = yield* store.raws('s1').after(null, 2);
        expect(first.items.map((each) => each.value.id)).toEqual(['c', 'a']);
        expect(first.hasMore).toBe(true);
        const rest = yield* store.raws('s1').after(first.items[1]!.meta._u);
        expect(rest.items.map((each) => each.value.id)).toEqual(['b']);
        expect(rest.items[0]?.value.payload).toEqual(raw('b').payload);
        expect((yield* store.lastRaw('s1'))?.id).toBe('b');
        expect(yield* store.lastRaw('none')).toBeNull();
      }),
    ));

  it('publishes each write to subscribers that subscribed before it', () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        const changes = yield* store.raws('s1').changes;
        yield* store.appendRaw(raw('a'));
        yield* store.appendRaw(raw('x', 's2'));
        yield* store.appendRaw(raw('b'));
        const got = yield* Stream.runCollect(Stream.take(changes, 2));
        expect(got.map((each) => each.value.id)).toEqual(['a', 'b']);
      }),
    ));

  it('saves a Session only when it changed', () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.saveSession(session);
        yield* store.saveSession(session);
        yield* store.saveSession({ ...session, status: 'running' });
        const { items } = yield* store.sessions.after(null);
        expect(items).toHaveLength(1);
        expect(items[0]?.value.status).toBe('running');
        expect(yield* store.allSessions).toEqual([
          { ...session, status: 'running' },
        ]);
      }),
    ));

  it('tombstones a removed Project and never brings it back', () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        const project = { id: 'p1', path: '/x', name: 'x', createdAt: 1 };
        yield* store.saveProject(project);
        expect(yield* store.removeProject('p1')).toBe(true);
        expect(yield* store.removeProject('p1')).toBe(false);
        yield* store.saveProject({ ...project, name: 'y' });
        expect(yield* store.project('p1')).toBeNull();
        expect(yield* store.allProjects).toEqual([]);
        const { items } = yield* store.projects.after(null);
        expect(items.map((each) => each.meta._d)).toEqual([true]);
      }),
    ));
});
