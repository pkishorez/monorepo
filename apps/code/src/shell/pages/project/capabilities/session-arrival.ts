import { Context, Effect, Layer } from 'effect';
import { Replicas } from '@kestack/std-toolkit/replica';
import { arrival } from '../../../machines/index.ts';

/*
 * Whether a new Session the Draft asked its Machine for is there, once
 * the answer to the ask was lost: as the project page, or a new session's
 * Starter, Provides it to the Draft under it, for its Machine.
 */

/** How long a Session asked for, its answer lost, is waited for, in ms. */
const WAIT = 15_000;

/** Whether a Session asked for has come, for one Machine. */
export class SessionArrival extends Context.Service<
  SessionArrival,
  {
    /** True once the Machine's Session with this id is held; false if it is not, in time. */
    readonly arrived: (sessionId: string) => Effect.Effect<boolean>;
  }
>()('code/SessionArrival') {
  /** For the Machine named, as the device holds its Sessions. */
  static readonly machine = (machineId: string) =>
    Layer.effect(
      SessionArrival,
      Effect.map(Effect.context<Replicas>(), (replicas) =>
        SessionArrival.of({
          arrived: (sessionId) =>
            arrival(machineId, sessionId).pipe(
              Effect.timeoutOption(WAIT),
              // The Machine's Instance held only while it waits.
              Effect.scoped,
              Effect.provideContext(replicas),
              Effect.map((came) => came._tag === 'Some'),
            ),
        }),
      ),
    );
}
