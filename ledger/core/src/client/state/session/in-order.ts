import { Effect } from 'effect';

/**
 * Runs the writes of each row one after another, in the order they were
 * made, while different rows' writes run side by side. Without it a Delete
 * and the Put an Undo makes right after are two requests in flight at once,
 * and the Backend may answer the Put first: the Delete then wins, and the
 * Entry an Undo brought back is gone again.
 */
export const makeInOrder = () => {
  // The last write of each row still waiting or running.
  const lanes = new Map<string, Promise<void>>();
  return <A, E, R>(key: string, write: Effect.Effect<A, E, R>) =>
    Effect.suspend(() => {
      const before = lanes.get(key) ?? Promise.resolve();
      let done!: () => void;
      const mine = new Promise<void>((resolve) => {
        done = resolve;
      });
      lanes.set(key, mine);
      return Effect.promise(() => before).pipe(
        Effect.andThen(write),
        Effect.ensuring(
          Effect.sync(() => {
            done();
            if (lanes.get(key) === mine) lanes.delete(key);
          }),
        ),
      );
    });
};
