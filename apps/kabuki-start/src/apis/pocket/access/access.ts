import { Effect } from 'effect';
import { Authz } from '@kestack/auth-toolkit';

/*
 * Whose records a call reaches: the caller's, always. The caller is the
 * signed-in User the Guard found; nothing the client sends names a User. A
 * read's cursor is a record the client hands back, so the User it names is
 * replaced with the caller before it positions anything.
 */

/** Runs `work` for the User calling. */
export const asCaller = <A, E, R>(
  work: (userId: string) => Effect.Effect<A, E, R>,
) => Effect.flatMap(Authz.User, ({ user }) => work(user.id));

/** `cursor` as the caller's own: the User it names is the caller. */
export const ownCursor = <T extends { readonly userId: string }, M>(
  cursor: { readonly value: T; readonly meta: M } | null,
  userId: string,
) =>
  cursor === null ? null : { ...cursor, value: { ...cursor.value, userId } };
