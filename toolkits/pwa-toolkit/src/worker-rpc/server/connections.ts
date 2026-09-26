import { makeInFlight } from '../handshake/index.js';

/** The part of a Service Worker API `Client` the Worker Server talks to. */
export interface TabHandle {
  readonly id: string;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

export interface Connection {
  readonly portId: number;
  readonly clientId: string;
  readonly connectionId: string;
  tab: TabHandle;
  readonly inFlight: ReturnType<typeof makeInFlight>;
}

/**
 * The Tab Client connections this worker instance has seen. Each gets the
 * numeric port id Effect's runner protocol uses. Held in memory only, so a
 * restarted worker starts empty.
 */
export const makeConnections = (onIdle: () => void) => {
  let nextPortId = 0;
  const byKey = new Map<string, Connection>();
  const byPort = new Map<number, Connection>();
  const keyOf = (clientId: string, connectionId: string) =>
    `${clientId}\u0000${connectionId}`;

  return {
    open(tab: TabHandle, connectionId: string): Connection {
      const existing = byKey.get(keyOf(tab.id, connectionId));
      if (existing) {
        existing.tab = tab;
        return existing;
      }
      const connection: Connection = {
        portId: nextPortId++,
        clientId: tab.id,
        connectionId,
        tab,
        inFlight: makeInFlight(onIdle),
      };
      byKey.set(keyOf(tab.id, connectionId), connection);
      byPort.set(connection.portId, connection);
      return connection;
    },
    find: (clientId: string, connectionId: string) =>
      byKey.get(keyOf(clientId, connectionId)),
    byPort: (portId: number) => byPort.get(portId),
    all: () => [...byPort.values()],
    ofClient: (clientId: string) =>
      [...byPort.values()].filter((c) => c.clientId === clientId),
    close(connection: Connection): void {
      byKey.delete(keyOf(connection.clientId, connection.connectionId));
      byPort.delete(connection.portId);
      connection.inFlight.clear();
    },
    get busy(): boolean {
      return [...byPort.values()].some((c) => c.inFlight.size > 0);
    },
  };
};
