import { createContext, useContext, useEffect, useState } from 'react';

/*
 * Whether what the Replica shows can be trusted to be whole. The Store
 * keeps in IndexedDB what this device last saw, so rows it has draw at
 * once; but on a new device, or for rows added elsewhere since, it fills
 * only once the app reaches the server. So an empty list, or a row not
 * found, means something only a moment after that: until then a page
 * draws its skeleton.
 */

/** Whether the app has reached the server since it loaded. */
export const Reached = createContext(false);

/** The connection to the server now: while it is not up, nothing can be sent. */
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

/** Whether an empty list or a missing row can be believed: a moment after the server is reached. */
export function useSettled(ms = 1200) {
  const reached = useContext(Reached);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!reached) return;
    const timer = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(timer);
  }, [reached, ms]);
  return settled;
}
