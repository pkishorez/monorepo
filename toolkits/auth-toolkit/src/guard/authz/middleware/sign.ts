import type { Effect } from 'effect';

import type { Unauthenticated } from './errors.js';
import { EXPECT_USER } from './headers.js';

/** The headers one guarded call is signed with, read at that call. Failing
 * Unauthenticated fails the call without sending it. */
export type Signature<R> = Effect.Effect<
  Readonly<Record<string, string>>,
  Unauthenticated,
  R
>;

/** The headers a Device signs a call with: its Account's Sign-in token, or a
 * Fake Token. */
export const bearer = (token: string): Readonly<Record<string, string>> => ({
  authorization: `Bearer ${token}`,
});

/** The headers a Browser signs a call with: the User it expects the cookie's
 * Active Account to be. The cookie itself goes by `credentials: 'include'`. */
export const expectUser = (
  userId: string,
): Readonly<Record<string, string>> => ({ [EXPECT_USER]: userId });
