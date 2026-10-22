import { Context, Effect, Layer, type Scope } from 'effect';
import { Ai } from '@kestack/ai-toolkit/client';
import { Store } from '@kestack/std-toolkit/replica';

/*
 * A Machine's records on this device, its `Ai` Instance in the Store, and
 * whether its page holds them. While the page is open its Replica syncs and
 * writes, and could make them again just after they went, so deleting them
 * then waits for the page to close: Forget and signing out leave the page
 * first, and the records go once it has. Another tab holding them is not
 * known here: the Store tells it to stop, as it tells this one.
 */

export class Records extends Context.Service<
  Records,
  {
    /** Holds the Machine's records for as long as the Scope: a delete asked meanwhile waits for it to close. */
    readonly hold: (
      machineId: string,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /** Deletes the Machine's records now, or once no page holds them: best effort. */
    readonly remove: (machineId: string) => Effect.Effect<void>;
  }
>()('code/MachineRecords') {
  static readonly layer: Layer.Layer<Records, never, Store> = Layer.effect(
    Records,
    Effect.gen(function* () {
      const store = yield* Store;
      const holders = new Map<string, number>();
      const asked = new Set<string>();
      const removeNow = (machineId: string) =>
        Effect.ignore(store.remove(Ai, machineId));
      const release = (machineId: string) =>
        Effect.suspend(() => {
          const left = (holders.get(machineId) ?? 1) - 1;
          if (left > 0) return Effect.sync(() => holders.set(machineId, left));
          holders.delete(machineId);
          // Not waited for: the Store waits for the page's Instance to stop,
          // and the page's other parts close alongside this.
          return asked.delete(machineId)
            ? Effect.asVoid(Effect.forkDetach(removeNow(machineId)))
            : Effect.void;
        });
      return Records.of({
        hold: (machineId) =>
          Effect.acquireRelease(
            Effect.sync(
              () =>
                void holders.set(machineId, (holders.get(machineId) ?? 0) + 1),
            ),
            () => release(machineId),
          ),
        remove: (machineId) =>
          Effect.suspend(() =>
            holders.has(machineId)
              ? Effect.sync(() => void asked.add(machineId))
              : removeNow(machineId),
          ),
      });
    }),
  );
}
