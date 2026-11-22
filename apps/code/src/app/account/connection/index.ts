import { ConnectionLive } from './actor.ts';

/** One Connection of the Account: its Actor. */
export const Connection = { actor: ConnectionLive };
export { refreshSetup, removeProject } from './commands.ts';
export {
  borrowed,
  health,
  PLUGIN_CODE,
  reach,
  Sockets,
  sockets,
  toNewest,
} from './link/index.ts';
export { moves, Moves } from './records/index.ts';
