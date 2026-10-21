import { createContext, useContext, useEffect, useState } from 'react';

/*
 * Whether what the Replica shows can be trusted to be whole. The Store
 * starts empty on every load and fills once the app reaches the server,
 * so an empty list, or a row not found, means something only a moment
 * after that: until then a page draws its skeleton.
 */

/** Whether the app has reached the server since it loaded. */
export const Reached = createContext(false);

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
