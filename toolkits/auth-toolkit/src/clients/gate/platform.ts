import { Memory } from '@kstackz/std-toolkit/db/memory';
import type { Backend } from './domain/index.js';
import { type GateTable, gateTable } from './memory.js';

/** What one tab tells the device's other tabs: look again. `quiet` are
 * accounts it signed out itself, so they are not reported lost there. */
export type TabMessage = { readonly quiet: ReadonlyArray<string> };

/** Everything the Gate needs from the platform it runs on. */
export interface GatePlatform {
  /** Where the Gate keeps what it remembers on this device: the Backend
   * chosen, and each Backend's Remembered Accounts. */
  readonly table: GateTable;
  /** When the app is online and in view. */
  readonly lifecycle: {
    readonly online: () => boolean;
    /** Calls `changed` whenever the network comes or goes. */
    readonly onOnlineChange: (changed: () => void) => () => void;
    /** Calls `shown` whenever the app comes back into view. */
    readonly onForeground: (shown: () => void) => () => void;
    /** The Backend the launch asked for, if any, as `?backend=device` does
     * on the web. Asked once, at start. */
    readonly launchBackend: () => Backend | null;
  };
  /** The device's other tabs, where there can be more than one. */
  readonly tabs?: {
    readonly announce: (message: TabMessage) => void;
    readonly listen: (heard: (message: TabMessage) => void) => () => void;
  };
}

/** A platform kept in memory, with no network events and no other tabs: for
 * tests, and for running the Gate where nothing outlives the process. */
export const memoryPlatform = (
  options: { readonly online?: () => boolean } = {},
): GatePlatform => ({
  table: Memory.make(gateTable).layer,
  lifecycle: {
    online: options.online ?? (() => true),
    onOnlineChange: () => () => {},
    onForeground: () => () => {},
    launchBackend: () => null,
  },
});
