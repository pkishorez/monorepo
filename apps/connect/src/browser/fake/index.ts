/*
 * `@kestack/connect/fake`: the Computers fake, the computers a person has,
 * each running `ke-connect` with its own disk, for a FakeWorld. Its state
 * starts with no computer; its controls add one, which comes up online,
 * its tunnel up and reached at once, take one offline and back, remove
 * it, and put a sample project, a folder or a file on its disk. Its Layer
 * gives `Computers`, what `inTab` (`@kestack/connect/browser`) runs
 * against, over a Connect Cloud that always answers. Browser-safe:
 * nothing here imports Node.
 */

export {
  computers,
  type ComputerState,
  type ComputersState,
  KE_CONNECT,
  SIGNED_IN_AS,
  SILENT_AT_ONCE,
} from './computers.js';
