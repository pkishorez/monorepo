import { Effect, Layer, RcMap, Schedule, Stream } from 'effect';
import type { Member } from '../../shared/contracts/member/index.ts';
import { Api, Browser, NotSignedIn } from '../../shared/pages/index.ts';

/*
 * The Api Console Provides to every page: the Console API bound to whoever
 * is signed in. Each member gets their own socket, opened on first use and
 * shared by every call and stream of theirs; it closes once nothing of
 * theirs uses it, as after an Account Switch. A stream follows the member:
 * on a switch it ends for the old one and begins again for the new one, so
 * no page ever reads one user's data on another user's socket. A socket
 * acts for its member only until their session ends: then the User Space
 * ends its streams and refuses its calls, the socket is dropped, and the
 * stream is followed again on one opened, and verified, anew.
 */

const refused = (error: unknown) =>
  (error as { readonly _tag?: unknown } | null)?._tag === 'Unauthenticated';

/** The Api for the member `signedIn` names: their id, now and on every change; null for nobody. */
export const apiLayer = (signedIn: {
  readonly now: Effect.Effect<Member | null>;
  readonly changes: Stream.Stream<Member | null>;
}) =>
  Layer.effect(
    Api,
    Effect.gen(function* () {
      const browser = yield* Browser;
      const sockets = yield* RcMap.make({
        lookup: (_userId: string) => browser.connect,
      });
      const ids = signedIn.changes.pipe(
        Stream.map((member) => member?.userId ?? null),
        Stream.changes,
      );
      return Api.of({
        call: (use) =>
          Effect.gen(function* () {
            const member = yield* signedIn.now;
            if (member === null) return yield* new NotSignedIn();
            const { client } = yield* RcMap.get(sockets, member.userId);
            return yield* use(client).pipe(
              Effect.tapError((error) =>
                refused(error)
                  ? RcMap.invalidate(sockets, member.userId)
                  : Effect.void,
              ),
            );
          }).pipe(Effect.scoped),
        follow: (use) =>
          ids.pipe(
            Stream.switchMap((userId) =>
              userId === null
                ? Stream.empty
                : Stream.unwrap(
                    Effect.map(
                      RcMap.get(sockets, userId),
                      ({ client, subscribe }) => subscribe(() => use(client)),
                    ),
                  ).pipe(
                    Stream.tapError((error) =>
                      refused(error)
                        ? RcMap.invalidate(sockets, userId)
                        : Effect.void,
                    ),
                    // A live stream that ends was ended at the socket's
                    // deadline: follow it again on a fresh one.
                    Stream.concat(
                      Stream.drain(
                        Stream.fromEffect(RcMap.invalidate(sockets, userId)),
                      ),
                    ),
                    Stream.repeat(Schedule.spaced('1 second')),
                  ),
            ),
          ),
      });
    }),
  );
