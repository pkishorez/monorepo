import { Authz } from '@kestack/auth-toolkit';

/*
 * Who may call what, the same on both Workers. Each Worker has three calls,
 * one per level:
 *
 * - public         anyone, signed in or not: no Guard at all.
 * - authenticated  any signed-in Account: `Authz.required`.
 * - authorized     the owner's Account alone: `Authz.policy`, an
 *                  Authorization Policy on who the caller is. Anyone else
 *                  signed in is refused Forbidden (403).
 */

/** The one Account the authorized call answers. */
export const OWNER = 'kishore.iiitn@gmail.com';

/** The Guard of the authorized call: the owner alone. */
export const ownerOnly = Authz.policy(
  ({ user }) => user.email === OWNER,
  `Only ${OWNER} may call this`,
);

/** The three levels, in the order the page shows them. */
export const LEVELS = ['public', 'authenticated', 'authorized'] as const;

export type Level = (typeof LEVELS)[number];
