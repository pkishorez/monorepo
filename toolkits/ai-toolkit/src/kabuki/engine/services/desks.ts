import { Deferred, Effect, Layer } from 'effect';
import { Desks, type Desk } from '../capabilities/index.js';

/* The Desks: one Deferred per Session id, done once its Desk is out. */

const make = Effect.sync(() => {
  const desks = new Map<string, Deferred.Deferred<Desk>>();
  const slot = (sessionId: string) => {
    let found = desks.get(sessionId);
    if (!found) {
      found = Deferred.makeUnsafe<Desk>();
      desks.set(sessionId, found);
    }
    return found;
  };
  return {
    put: (sessionId: string, desk: Desk) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const before = desks.get(sessionId);
          if (before && Deferred.isDoneUnsafe(before)) desks.delete(sessionId);
          const mine = slot(sessionId);
          Deferred.doneUnsafe(mine, Effect.succeed(desk));
          return mine;
        }),
        (mine) =>
          Effect.sync(() => {
            if (desks.get(sessionId) === mine) desks.delete(sessionId);
          }),
      ).pipe(Effect.asVoid),
    of: (sessionId: string) => Deferred.await(slot(sessionId)),
  };
});

export const desks: Layer.Layer<Desks> = Layer.effect(Desks, make);
