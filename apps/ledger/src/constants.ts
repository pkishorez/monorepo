/**
 * How a User's money reaches every device. `realtime`: each change is
 * pushed the moment it is made, and the cloud Backend keeps each User's
 * money in a Durable Object of their own. `polling`: each device asks for
 * changes every few seconds, and the cloud Backend keeps every User's money
 * in one D1 database. The device Backend follows it too. Chosen here, when
 * Ledger is built: the app and the Worker both read it, so they agree.
 */
export type SyncMode = 'realtime' | 'polling';

export const syncMode = 'realtime' as SyncMode;
