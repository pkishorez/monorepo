/*
 * Cloud Connect: where a Machine signs in and sends its Heartbeats, and
 * what lists each User's Machines. Its contract, the client a Machine or an
 * App reaches it with, the Worker that serves it, and the origins it lets
 * in. deploy/ puts it on Cloudflare.
 */

export {
  addressOf,
  AUTH_PATH,
  AuthInfo,
  CloudApi,
  Machine,
  MachineForgotten,
  MachineReport,
  MachineStatus,
  MachineTaken,
  RPC_PATH,
  TunnelCheck,
} from './contract/index.js';
export { authInfo, CloudClient } from './client/index.js';
export { machinesTable, serve, serveOver } from './serve/index.js';
export { allowsOrigin } from './origins/index.js';
