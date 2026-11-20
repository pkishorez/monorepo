import type { IDBConnection } from '../database/index.js';

export const abortQuietly = (transaction: IDBTransaction) => {
  try {
    transaction.abort();
  } catch {
    return;
  }
};

// A version change (another table of the same database adding its store,
// in this tab or another) closes the connection under whatever was running
// on it. That ran nothing, so it runs again on the connection opened next.
const closedUnderneath = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'name' in cause &&
  (cause.name === 'InvalidStateError' || cause.name === 'AbortError');

/** Runs `run` on the open database, once more on a fresh one if a version change closed it. */
export const withConnection = async <A>(
  database: IDBConnection,
  run: (connection: IDBDatabase) => Promise<A>,
): Promise<A> => {
  try {
    return await run(await database.open());
  } catch (cause) {
    if (!closedUnderneath(cause)) throw cause;
    return run(await database.open());
  }
};
