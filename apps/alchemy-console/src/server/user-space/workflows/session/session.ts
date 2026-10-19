import { Effect, Stream } from 'effect';
import { Auth, type Principal } from '@kestack/auth-toolkit';
import type { Member } from '../../../../shared/contracts/member/index.ts';
import { Storage } from '../../services/storage/index.ts';

/*
 * The Session group's handlers: who the caller is in their User Space. Each
 * call records the caller as the owner, as the Auth Worker names them now,
 * so a renamed user is seen renamed by every tab watching.
 */

const callerOf = ({ user }: Principal): Member => ({
  userId: user.id,
  email: user.email,
  name: user.name,
});

/** The handlers, for the composition root to serve under `ConsoleApi`. */
export const sessionHandlers = Effect.gen(function* () {
  const storage = yield* Storage;
  return {
    'Session.me': () =>
      Effect.gen(function* () {
        const caller = callerOf(yield* Auth.User);
        yield* storage.owner.put(caller);
        return caller;
      }),
    'Session.watch': () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const caller = callerOf(yield* Auth.User);
          yield* storage.owner.put(caller);
          return storage.owner.changes.pipe(
            Stream.map((owner) => owner ?? caller),
          );
        }),
      ),
  };
});
