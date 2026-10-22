import { createContext, useContext } from 'react';

/*
 * The connection to the server, for the header and the composers: while
 * it is not up, nothing can be sent. Whether a list or a row the Replica
 * shows can be believed empty is each Query's own `caughtUp`.
 */

/** The connection to the server now. */
export const Connection = createContext<
  'connecting' | 'connected' | 'reconnecting'
>('connecting');

/** What the app is doing while the server is out of reach, or null when it is in reach. */
export const useOffline = () => {
  const connection = useContext(Connection);
  return connection === 'connected'
    ? null
    : connection === 'connecting'
      ? 'Connecting'
      : 'Reconnecting';
};
