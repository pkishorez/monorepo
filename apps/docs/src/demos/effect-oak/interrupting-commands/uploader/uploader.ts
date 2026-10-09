import { Context, Effect, Fiber, Layer } from 'effect';

/*
 * Commands that can be stopped one at a time, by key. Effect Oak can stop all
 * of a Node's running Commands at once (`replaceCommands`), but not one of
 * them, so this Service keeps the work of each running upload by its id.
 *
 * `run` does the work in a child fiber of the Command, so the Command still
 * owns it: stopping the Command (leaving, destroying, `replaceCommands`)
 * stops the work too. `cancel` stops the work for one id, and the Command
 * waiting on it ends without a Message.
 */

export type Outcome = 'Interrupted' | 'NotFound';

export class Uploader extends Context.Service<
  Uploader,
  {
    readonly run: <A>(id: number, work: Effect.Effect<A>) => Effect.Effect<A>;
    readonly cancel: (id: number) => Effect.Effect<Outcome>;
  }
>()('docs/interrupting-commands/Uploader') {}

export const UploaderLive = Layer.sync(Uploader, () => {
  const running = new Map<number, Fiber.Fiber<unknown>>();
  return {
    run: <A>(id: number, work: Effect.Effect<A>) =>
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(work);
        running.set(id, fiber);
        return yield* Fiber.join(fiber).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (running.get(id) === fiber) running.delete(id);
            }),
          ),
        );
      }),
    cancel: (id: number) =>
      Effect.suspend(() => {
        const fiber = running.get(id);
        if (!fiber) return Effect.succeed<Outcome>('NotFound');
        running.delete(id);
        return Fiber.interrupt(fiber).pipe(Effect.as<Outcome>('Interrupted'));
      }),
  };
});
