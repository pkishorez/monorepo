import type { Machine as MachineSchema } from '@kestack/connect/code';
import { createContext, use, useEffect, useState } from 'react';
import { health } from '../../layer/capabilities/index.ts';

type Machine = typeof MachineSchema.Type;

/*
 * Every Machine as the Views see it: as listed, and its socket now. While
 * a Machine's socket is not up, nothing can be sent to it, and what it
 * synced stays readable, marked by its Last Seen; the header of a page on
 * it says why, from its record: on its way, its tunnel broken, or the
 * Machine down. Whether a list or a row the Replica shows can be believed
 * empty is each Query's own `caughtUp` and `neverSynced`.
 */

type Status = 'connecting' | 'connected' | 'reconnecting';

/** The Machines as listed, null before any list, and each one's socket now. */
export const Connection = createContext<{
  readonly machines: ReadonlyArray<Machine> | null;
  readonly status: Readonly<Record<string, Status>>;
}>({ machines: null, status: {} });

/** The Machine a project's or a session's page is on: its address names it. */
export const PageMachine = createContext('');

/** The id of the Machine the page is on, for links to its Routes. */
export const useMachineId = () => use(PageMachine);

/** The Machines as listed, empty before any list. */
export const useMachines = () => use(Connection).machines ?? [];

/** The Machine as listed, if it is. */
export const useMachine = (machineId: string) =>
  use(Connection).machines?.find(({ id }) => id === machineId) ?? null;

/** A Machine's name to show beside what is its, or null while there is only one Machine. */
export const useMachineName = (machineId: string) => {
  const machines = useMachines();
  if (machines.length < 2) return null;
  return machines.find(({ id }) => id === machineId)?.name ?? null;
};

const statusOf = (
  status: Readonly<Record<string, Status>>,
  machineId: string,
): Status => status[machineId] ?? 'connecting';

/** What the app is doing while the Machine is out of reach, or null when it is in reach. */
export const useOffline = (machineId: string) => {
  const status = statusOf(use(Connection).status, machineId);
  return status === 'connected'
    ? null
    : status === 'connecting'
      ? 'Connecting'
      : 'Reconnecting';
};

const TICK = 5_000;

/** Why the Machine is out of reach, worked out again every few seconds while it is. */
export const useHealth = (machineId: string) => {
  const status = statusOf(use(Connection).status, machineId);
  const machine = useMachine(machineId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status === 'connected') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK);
    return () => clearInterval(timer);
  }, [status]);
  return health(machine, status, now);
};

/** Every Machine's health at once, by its id, worked out again every few seconds while any is out of reach. */
export const useHealths = () => {
  const { machines, status } = use(Connection);
  const away = (machines ?? []).some(
    ({ id }) => statusOf(status, id) !== 'connected',
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!away) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK);
    return () => clearInterval(timer);
  }, [away]);
  return (machineId: string) =>
    health(
      machines?.find(({ id }) => id === machineId) ?? null,
      statusOf(status, machineId),
      now,
    );
};
