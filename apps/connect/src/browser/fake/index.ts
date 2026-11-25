import type { Runtime } from '@kestack/kabuki';
import { fileSystem } from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import { ComputersFake, ROOT_CONTROLS } from './actor.js';
import { COMPUTER_CONTROLS } from './computer.js';
import { serveComputers } from './serve.js';

/*
 * The Computers Fake: the computers a person has, each running
 * `ke-connect` with its own disk, in a browser tab. Its Actor starts
 * blank, no computer; its Controls make the world: a computer added comes
 * up online, its tunnel up and reached at once, and goes offline, comes
 * back or is removed; its disk has its File System's. `serve` gives
 * `Computers`, what `inTab` (`@kestack/connect/browser`) runs against,
 * over a Connect Cloud that always answers. Browser-safe: nothing here
 * imports Node.
 *
 * `controls` are Message tags, each of the one Actor in the tree that has
 * it: the Computers root's own, each computer's, and each computer's File
 * System's. A reload keeps the whole Snapshot: nothing in it dies with the
 * page.
 */

export const computers = {
  name: 'Computers',
  actor: ComputersFake,
  controls: [
    ...ROOT_CONTROLS,
    ...COMPUTER_CONTROLS,
    ...fileSystem.controls,
  ] as const,
  serve: (runtime: Runtime<typeof ComputersFake>) => serveComputers(runtime),
};

export {
  blank,
  ComputersFake,
  KE_CONNECT,
  ROOT_CONTROLS,
  SIGNED_IN_AS,
  type ComputersMessage,
  type ComputersModel,
} from './actor.js';
export {
  COMPUTER_CONTROLS,
  ComputerFake,
  ComputerFakeLive,
  SILENT_AT_ONCE,
  type ComputerMessage,
  type ComputerModel,
} from './computer.js';
export { serveComputers } from './serve.js';
