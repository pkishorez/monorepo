import { ledgerSession } from './session.ts';

/** The open Session; only inside the app's `SignedIn`, where it never
 * changes User. Screens read money through Queries and change it through
 * Mutations, not through the Session itself. */
export const useSession = ledgerSession.use;

/** The User whose Session is open. */
export const useUser = () => useSession().user;
