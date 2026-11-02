import { Rpc, RpcGroup } from 'effect/rpc';
import { PluginStatus } from './values.js';

/*
 * What a CLI and its Plugins agree on. The CLI starts a Plugin's process
 * with its socket and folders in the environment, and waits for `ready` on
 * Node IPC. The Plugin serves its own RPC group at `/rpc` on that socket,
 * and PluginControl at `/control`, both over WebSocket, and any routes of
 * its own beside them. What it serves under `/public/` is its Public Area.
 * Whatever passes a request on to the socket says in PluginAccess whether
 * its caller holds the CLI's key: only the Public Area answers one that
 * does not. A CLI that marks every request says so in PluginEnv's
 * `access`.
 */

export { PluginState, PluginStatus } from './values.js';
export { Plugins } from './plugins.js';

/** The environment a Plugin's process is started with. */
export const PluginEnv = {
  /** The Plugin's name. */
  name: 'KESTACK_PLUGIN_NAME',
  /** The Unix socket, or named pipe, it listens on. */
  socket: 'KESTACK_PLUGIN_SOCKET',
  data: 'KESTACK_PLUGIN_DATA',
  state: 'KESTACK_PLUGIN_STATE',
  cache: 'KESTACK_PLUGIN_CACHE',
  shared: 'KESTACK_PLUGIN_SHARED',
  /**
   * Set, to PluginAccess's header, by a CLI that marks every request it
   * passes on with it: then a request without it reaches nothing.
   */
  access: 'KESTACK_PLUGIN_ACCESS',
} as const;

/** Where on its socket a Plugin serves what. */
export const PluginPaths = {
  rpc: '/rpc',
  control: '/control',
  public: '/public',
} as const;

/** The header that says whether a request's caller holds the CLI's key. */
export const PluginAccess = {
  header: 'x-ke-connect-access',
  /** The caller holds the key: it may reach anything. */
  key: 'key',
  /** Anyone: only the Public Area answers it. */
  public: 'public',
} as const;

/** What a Plugin sends its CLI over Node IPC once it listens. */
export const READY = { ready: true } as const;

/** How a CLI asks a running Plugin about itself. */
export const PluginControl = RpcGroup.make(
  /** What it is and since when it runs. */
  Rpc.make('status', { success: PluginStatus.schema }),
  /** Answers while it serves. */
  Rpc.make('health'),
);
