import { sessionsLayer } from './sessions/index.js';

/**
 * Every Capability the Kabuki Tool's tree Requires, from the DevTools
 * Server at `origin`: the live Kabuki Sessions and each one's Api.
 */
export const kabukiLayer = (origin: string) => sessionsLayer(origin);
