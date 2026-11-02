import { Effect, Stream } from 'effect';
import { Agents, Store } from '../../capabilities/index.js';
import { EngineRaw } from '../../engine-raw/index.js';
import type { SessionSelf } from './actor.js';

/*
 * The between Worker: stores what the Agent writes while no Turn runs, a
 * background subagent's records and a Background Job's end, as it comes.
 * Each joins the Session's latest Turn, the running one or the last that
 * ran: a client finds a subagent's records by its tool call, whatever Turn
 * they are in.
 */

export const between = (self: SessionSelf) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const { model } = yield* self.get;
    const sessionId = model.session.id;
    const kept = yield* (yield* Agents).of(sessionId);
    /** The latest Turn: the running one, else the last stored. */
    let latest: string | undefined;
    yield* self.changes.pipe(
      Stream.runForEach(({ state }) =>
        Effect.sync(() => {
          if (state._tag === 'Running') latest = state.turnId;
        }),
      ),
      Effect.forkChild,
    );
    const turnId = Effect.gen(function* () {
      if (latest !== undefined) return latest;
      latest = (yield* store.lastTurn(sessionId)).at(0)?.turnId;
      return latest;
    });
    yield* Stream.runForEach(kept.between, (out) =>
      Effect.gen(function* () {
        const into = yield* turnId;
        if (into === undefined) return;
        const raw = yield* EngineRaw.stamp(
          { sessionId, turnId: into, harness: model.session.harness },
          out,
        );
        yield* store.appendRaw(raw);
      }),
    );
  });
