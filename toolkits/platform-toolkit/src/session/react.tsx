import {
  createContext,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from 'react';
import type { Opened } from './open.js';
import type { SessionStatus } from './status.js';

// The open Session, for whatever reads it under `SignedIn`: one per page,
// as one app runs per page.
const OpenSession = createContext<Opened<unknown> | undefined>(undefined);

/** Gives the open Session to everything inside. `SignedIn` renders it. */
export function OpenSessionProvider(props: {
  readonly opened: Opened<unknown>;
  readonly children: ReactNode;
}) {
  return <OpenSession value={props.opened}>{props.children}</OpenSession>;
}

/** The open Session; only inside `SignedIn`. */
export const useOpened = (): Opened<unknown> => {
  const opened = useContext(OpenSession);
  if (opened === undefined)
    throw new Error('A Session is only open inside SignedIn');
  return opened;
};

/** The open Session's status, live; only inside `SignedIn`. */
export const useOpenedStatus = (): SessionStatus => {
  const { status } = useOpened();
  return useSyncExternalStore(status.subscribe, status.get, status.get);
};

/** The open Session, or undefined outside `SignedIn`. */
export const useOpenedOrNone = (): Opened<unknown> | undefined =>
  useContext(OpenSession);
