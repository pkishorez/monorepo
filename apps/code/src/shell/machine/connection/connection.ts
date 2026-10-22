import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';

type Machine = typeof MachineSchema.Type;
import { createContext, useContext, useEffect, useState } from 'react';
import { health } from '../../machines/index.ts';

/*
 * The connection to the Machine, for the header and the composers: while
 * it is not up, nothing can be sent, and what was synced stays readable.
 * The header says why, from the Machine's record: on its way, its tunnel
 * broken, or the Machine down, with when it was last seen. Whether a list
 * or a row the Replica shows can be believed empty is each Query's own
 * `caughtUp`.
 */

/** The Machine the page is on, the socket to it now, and the Machine as listed, if it is. */
export const Connection = createContext<{
  readonly machineId: string;
  readonly status: 'connecting' | 'connected' | 'reconnecting';
  readonly machine: Machine | null;
}>({ machineId: '', status: 'connecting', machine: null });

/** The id of the Machine the page is on, for links to its places. */
export const useMachineId = () => useContext(Connection).machineId;

/** What the app is doing while the Machine is out of reach, or null when it is in reach. */
export const useOffline = () => {
  const { status } = useContext(Connection);
  return status === 'connected'
    ? null
    : status === 'connecting'
      ? 'Connecting'
      : 'Reconnecting';
};

const TICK = 5_000;

/** Why the Machine is out of reach, worked out again every few seconds while it is. */
export const useHealth = () => {
  const { status, machine } = useContext(Connection);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status === 'connected') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK);
    return () => clearInterval(timer);
  }, [status]);
  return health(machine, status, now);
};
