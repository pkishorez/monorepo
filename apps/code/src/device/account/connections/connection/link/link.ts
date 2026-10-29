import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { createContext, use, useEffect, useState } from 'react';
import {
  health,
  type Health,
  noticePillOf,
  outOfReach,
} from './health/index.ts';
import type { Behind } from './reach/index.ts';

type Connection = typeof ConnectionSchema.Type;

/*
 * How each Connection is reached, and what the Views see of it: its socket
 * (`reach/`), what its record says of it (`health/`), and how a call to it
 * ends when refused (`refusal/`). Here, every Connection as the Views see it:
 * as listed, and its socket now. While
 * a Connection's socket is not up, nothing can be sent to it, and what it
 * synced stays readable, marked by its Last Seen; the header of a page on
 * it says why, from its record: on its way, its tunnel broken, or the
 * Connection down; and, once it closed a socket running another Release of
 * the code Plugin, who is behind (`reach/release.ts`). Whether a list or a row the Replica shows can be believed
 * empty is each Query's own `caughtUp` and `neverSynced`.
 */

type Status = 'linking' | 'linked' | 'relinking';

/**
 * The Connections as listed, null before any list, each one's socket now,
 * whether their Last Seen is believed yet (`Known.checked`), and who is
 * behind on each that closed its socket running another Release.
 */
export const Links = createContext<{
  readonly connections: ReadonlyArray<Connection> | null;
  readonly status: Readonly<Record<string, Status>>;
  readonly checked: boolean;
  /** None while no Connection refused this Code's Release. */
  readonly behind?: Readonly<Record<string, Behind>>;
}>({ connections: null, status: {}, checked: false });

/** The Connection a project's or a session's page is on: its address names it. */
export const PageConnection = createContext('');

/** The id of the Connection the page is on, for links to its Routes. */
export const useConnectionId = () => use(PageConnection);

/** The Connections as listed, empty before any list. */
export const useConnections = () => use(Links).connections ?? [];

/** The Connection as listed, if it is. */
export const useConnection = (connectionId: string) =>
  use(Links).connections?.find(({ id }) => id === connectionId) ?? null;

/**
 * A Connection's name as short as it is still its own, as the app says it
 * everywhere: the name it was served as, for one named `<host> (<name>)`;
 * else the name in full.
 */
export const shortNameOf = (name: string) =>
  /\(([^()]+)\)$/.exec(name)?.[1] ?? name;

/** A Connection's short name to show beside what is its, or null while there is only one Connection. */
export const useConnectionName = (connectionId: string) => {
  const connections = useConnections();
  if (connections.length < 2) return null;
  const name = connections.find(({ id }) => id === connectionId)?.name;
  return name === undefined ? null : shortNameOf(name);
};

const statusOf = (
  status: Readonly<Record<string, Status>>,
  connectionId: string,
): Status => status[connectionId] ?? 'linking';

/** What the app is doing while the Connection is out of reach, or null when it is in reach. */
export const useOffline = (connectionId: string) => {
  const status = statusOf(use(Links).status, connectionId);
  return status === 'linked'
    ? null
    : status === 'linking'
      ? 'Linking'
      : 'Relinking';
};

/**
 * Whether a page says, over its Draft, that its Connection is out of reach:
 * once a link that was up dropped, or the Connection is known to be out of
 * reach; never while its link is only on its way, as a page opens, which
 * the header says: so the Draft never moves as the link comes up.
 */
export const offlineSaid = (status: Status, health: Health) =>
  status === 'relinking' || outOfReach(health);

/** Whether the page says, over its Draft, its Connection is out of reach now (`offlineSaid`). */
export const useOfflineSaid = (connectionId: string) => {
  const status = statusOf(use(Links).status, connectionId);
  return offlineSaid(status, useHealth(connectionId));
};

const TICK = 5_000;

/** The time now, worked out again every few seconds while `ticking`. */
const useNow = (ticking: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
};

/** Why the Connection is out of reach, worked out again every few seconds while it is. */
export const useHealth = (connectionId: string) => {
  const { status: links, checked } = use(Links);
  const status = statusOf(links, connectionId);
  const connection = useConnection(connectionId);
  const now = useNow(status !== 'linked');
  return health(connection, status, now, checked);
};

/** How long a Link may be on its way before a Connection's settings are said to be locked. */
export const LOCK_GRACE = 4_000;

/**
 * Whether a Connection's settings can't be changed now, its Link not
 * up, and whether to say so: once it is out of reach, or its Link
 * has been on its way for longer than `LOCK_GRACE`, so a Link linking
 * as the page opens is never called locked.
 */
export const useLock = (connectionId: string) => {
  const health = useHealth(connectionId);
  const locked = health._tag !== 'Linked';
  const [late, setLate] = useState(false);
  useEffect(() => {
    setLate(false);
    if (!locked) return;
    const timer = setTimeout(() => setLate(true), LOCK_GRACE);
    return () => clearTimeout(timer);
  }, [locked]);
  return { health, locked, said: locked && (late || outOfReach(health)) };
};

/** Every Connection's health at once, by its id, worked out again every few seconds while any is out of reach. */
export const useHealths = () => {
  const { connections, status, checked } = use(Links);
  const away = (connections ?? []).some(
    ({ id }) => statusOf(status, id) !== 'linked',
  );
  const now = useNow(away);
  return (connectionId: string) =>
    health(
      connections?.find(({ id }) => id === connectionId) ?? null,
      statusOf(status, connectionId),
      now,
      checked,
    );
};

/** The time now for what is said of a Connection's code Plugin, worked out again every few seconds while it is not simply running. */
export const useNoticeClock = (connection: Connection | null) =>
  useNow(
    connection !== null &&
      Object.values(connection.plugins).some(({ _tag }) => _tag !== 'Running'),
  );

/** Who is behind, once the Connection closed a socket running another Release of the code Plugin; null while it has not. */
export const useBehind = (connectionId: string): Behind | null =>
  use(Links).behind?.[connectionId] ?? null;

/** The pill for the Connection's code Plugin or `ke-connect`, worked out again every few seconds while its Plugin is not simply running (`noticePillOf`). */
export const useNoticePill = (connectionId: string) => {
  const connection = useConnection(connectionId);
  const behind = useBehind(connectionId);
  return noticePillOf(connection, useNoticeClock(connection), behind);
};
