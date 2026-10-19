import { Clock, Effect, Stream } from 'effect';
import { Auth } from '@kestack/auth-toolkit';

/*
 * A socket stays open past the call that started a stream, so a stream
 * would go on after its caller's session ends. Each one ends at the
 * caller's deadline instead: the browser subscribes again, is refused, and
 * opens a socket verified again.
 */

type Handler = (...args: never) => unknown;

/** `handlers`, each stream ending when its caller's session does. */
export const sessionBound = <H extends Readonly<Record<string, Handler>>>(
  handlers: H,
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
                const now = yield* Clock.currentTimeMillis;
                const until =
                  principal.kind === 'session'
                    ? new Date(principal.session.expiresAt).getTime()
                    : now;
                return answer.pipe(
                  Stream.interruptWhen(Effect.sleep(Math.max(0, until - now))),
                );
              }),
            )
          : answer;
      },
    ]),
  ) as unknown as H;
