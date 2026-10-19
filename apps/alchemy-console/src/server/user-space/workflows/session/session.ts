import { Effect, Stream } from 'effect';
import { Auth, type Principal } from '@kestack/auth-toolkit';
import type { Member } from '../../../../shared/contracts/member/index.ts';
import { Storage } from '../../services/storage/index.ts';

/*
 * The Session group's handlers: who the caller is in their User Space. Each
 * call records the caller as the owner, as the Auth Worker last named them,
 * so a renamed user is seen renamed by every tab watching.
 */

const callerOf = (principal: Principal) => ({
  member: {
    userId: principal.user.id,
    email: principal.user.email,
    name: principal.user.name,
  } satisfies Member,
  // When the Worker verified the caller: an older word never undoes a newer.
  at:
    principal.kind === 'session'
      ? new Date(principal.session.updatedAt).getTime()
      : 0,
});

/** The handlers, for the composition root to serve under `ConsoleApi`. */
export const sessionHandlers = Effect.gen(function* () {
  const storage = yield* Storage;
  return {
    'Session.me': () =>
      Effect.gen(function* () {
        const { member, at } = callerOf(yield* Auth.User);
        return yield* storage.owner.put(member, at);
      }),
    'Session.watch': () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const { member, at } = callerOf(yield* Auth.User);
          const recorded = yield* storage.owner.put(member, at);
          return storage.owner.changes.pipe(
            Stream.map((owner) => owner ?? recorded),
          );
        }),
      ),
  };
});
