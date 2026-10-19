import { Effect, Stream } from 'effect';
import { Auth } from '@kestack/auth-toolkit';
import type { Deadlines } from './deadlines.ts';

/*
 * A socket stays open past the call that started a stream, so a stream
 * would go on after its caller's session ends. Each one ends at the
 * caller's deadline instead, kept on the object's alarm: the browser
 * subscribes again, is refused, and opens a socket verified again.
 */

type Handler = (...args: never) => unknown;

/** `handlers`, each stream ending when its caller's session does. */
export const sessionBound = <H extends Readonly<Record<string, Handler>>>(
  handlers: H,
  deadlines: Pick<Deadlines, 'at'>,
): H =>
  Object.fromEntries(
    Object.entries(handlers).map(([tag, handle]) => [
      tag,
      (...args: ReadonlyArray<unknown>) => {
        const answer = (handle as (...args: ReadonlyArray<unknown>) => unknown)(
          ...args,
        );
        return Stream.isStream(answer)
          ? Stream.unwrap(
              Effect.gen(function* () {
                const principal = yield* Auth.User;
                const until =
                  principal.kind === 'session'
                    ? new Date(principal.session.expiresAt).getTime()
                    : 0;
                return answer.pipe(Stream.interruptWhen(deadlines.at(until)));
              }),
            )
          : answer;
      },
    ]),
  ) as unknown as H;
