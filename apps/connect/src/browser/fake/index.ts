import type { Runtime, Snapshot } from '@kestack/kabuki';
import { fileSystem } from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import { blank, ComputersFake, ROOT_CONTROLS } from './actor.js';
import { COMPUTER_CONTROLS } from './computer.js';
import { serveComputers } from './serve.js';

/*
 * The Computers Fake: the computers a person has, each running
 * `ke-connect` with its own disk, and Connect Cloud's own conditions, in a
 * browser tab. Its Actor starts blank, no computer and Connect Cloud as
 * deployed; its Controls make the world; `serve` gives `Computers` and
 * `ConnectCloud`, what `inTab` (`@kestack/connect/browser`) runs against.
 * Browser-safe: nothing here imports Node.
 *
 * - `controls` are Message tags, each of the one Actor in the tree that
 *   has it: the Computers root's own (add a computer, Connect Cloud's
 *   conditions), each computer's, and each computer's File System's.
 * - `kept` is the Snapshot a reload keeps: the same, but for each Model's
 *   `untilReload`, set back blank, and each computer's sockets, none. It
 *   holds what makes the App the older side (a computer on another
 *   Release, Connect Cloud naming a newer one), which an App ends by
 *   moving to its newest build, a reload; kept, it would reload forever.
 *   A reload closes every socket.
 */

/** The Snapshot a reload keeps: `untilReload` set back blank, in the root and each computer, and no socket open. */
const kept = (
  snapshot: Snapshot<typeof ComputersFake>,
): Snapshot<typeof ComputersFake> => ({
  ...snapshot,
  root: {
    ...snapshot.root,
    model: { ...snapshot.root.model, untilReload: blank().untilReload },
    children: {
      ...snapshot.root.children,
      computers: snapshot.root.children.computers.map((computer) => ({
        ...computer,
        model: {
          ...computer.model,
          untilReload: { runsAnotherRelease: false },
          sockets: 0,
        },
      })),
    },
  },
});

export const computers = {
  name: 'Computers',
  actor: ComputersFake,
  controls: [
    ...ROOT_CONTROLS,
    ...COMPUTER_CONTROLS,
    ...fileSystem.controls,
  ] as const,
  serve: (runtime: Runtime<typeof ComputersFake>) => serveComputers(runtime),
  kept,
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
