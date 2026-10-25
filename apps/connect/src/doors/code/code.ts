/*
 * `@kestack/connect/code`: what Code's browser imports. For now, Cloud
 * Connect's contract and client: the Machines an App lists and forgets.
 */

export {
  addressOf,
  AUTH_PATH,
  CloudApi,
  Machine,
  MachineForgotten,
  MachineReport,
  MachineStatus,
  MachineTaken,
  RPC_PATH,
  TunnelCheck,
} from '../../cloud/contract/index.js';
export { CloudClient } from '../../cloud/client/index.js';
