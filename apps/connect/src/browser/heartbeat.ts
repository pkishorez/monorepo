import { type Duration, Effect, Semaphore, Stream } from 'effect';
import type { Release } from '../contracts/heartbeat/index.js';
import {
  cloud,
  type HeartbeatClient,
} from '../connection/cli/identity/cloud/index.js';
import type { Computer, Stopped } from './computers/index.js';

/*
 * One computer's Heartbeat in a tab, as `ke-connect` sends it: a Report of
 * its id, Computer Name, Connection Key, version and tunnel, at once as it
 * starts, every `every` after, and at once whenever one of those changes;
 * one at a time. Each is sent through `ke-connect`'s own Connect Cloud
 * client (connection/cli/identity/cloud), so it is answered as `ke-connect`
 * reads it: the Releases to run, or why the computer must stop, forgotten,
 * signed out, Outdated, or its id taken, which ends the Heartbeat. A Report
 * Connect Cloud could not take is sent again with the next.
 */

export interface HeartbeatOptions {
  /** The computer now, then on each change. */
  readonly computer: Stream.Stream<Computer>;
  /** Connect Cloud's Heartbeat client, signed in as the computer's User. */
  readonly client: HeartbeatClient['Service'];
  /** Who the computer is signed in as. */
  readonly user: { readonly id: string; readonly email: string };
  /** How long between Reports. */
  readonly every: Duration.Input;
  /** Told the Releases Connect Cloud named in answer to each Report. */
  readonly answered: (
    wanted: Readonly<Record<string, Release>>,
  ) => Effect.Effect<void>;
}

/** What a Report says of a computer, so a change to it is reported at once. */
const reportOf = ({ id, name, key, version, status }: Computer) =>
  JSON.stringify({ id, name, key, version, status });

/** Sends the computer's Heartbeat until it must stop, then says why. */
export const heartbeat = (options: HeartbeatOptions): Effect.Effect<Stopped> =>
  Effect.gen(function* () {
    let now: Computer | undefined;
    const send = (computer: Computer): Effect.Effect<void, Stopped> =>
      cloud({
        client: options.client,
        connection: { id: computer.id, name: computer.name },
        version: computer.version,
        user: options.user,
        signInAgain: Effect.fail(
          'A computer in a tab signs in again only as it starts again',
        ),
      })
        .report(computer.status, computer.key)
        .pipe(
          Effect.flatMap((outcome): Effect.Effect<void, Stopped> => {
            switch (outcome._tag) {
              case 'Reported':
                return options.answered(outcome.wanted);
              case 'Forgotten':
                return Effect.fail({ _tag: 'Forgotten' });
              case 'SignedOut':
                return Effect.fail({ _tag: 'SignedOut' });
              case 'Outdated':
                return Effect.fail({ _tag: 'Outdated', line: outcome.line });
              case 'Refused':
                return Effect.fail({ _tag: 'Taken' });
              case 'Unsent':
                return Effect.void;
            }
          }),
        );
    const oneAtATime = yield* Semaphore.make(1);
    const report = oneAtATime.withPermit(
      Effect.suspend(() => (now === undefined ? Effect.void : send(now))),
    );
    return yield* Effect.all(
      [
        options.computer.pipe(
          Stream.tap((computer) =>
            Effect.sync(() => {
              now = computer;
            }),
          ),
          Stream.map(reportOf),
          Stream.changes,
          Stream.runForEach(() => report),
        ),
        Effect.sleep(options.every).pipe(
          Effect.andThen(report),
          Effect.forever,
        ),
      ],
      { concurrency: 'unbounded', discard: true },
    ).pipe(Effect.andThen(Effect.never), Effect.flip);
  });
