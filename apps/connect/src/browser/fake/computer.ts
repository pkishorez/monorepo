import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { FileSystemFake } from '../../connection/plugins/code/engine/services/file-system/fake/index.js';

/*
 * One computer running `ke-connect`, faked: a keyed Child of the Computers
 * Fake, by its Connection id, owning its File System Fake as a Child of
 * its own, so each computer has its own disk and git, with their Controls.
 *
 * Its Model is what the computer is now, in a person's words: on or off,
 * and why its `ke-connect` last stopped. It comes up online, its tunnel up
 * and reached at once; serve.ts reads it into what Connect in the tab
 * reads, a `Computer`. Every Control lands: it goes offline, comes back
 * online, which clears why it last stopped, or is removed.
 *
 * `StoppedOnItsOwn` is not a Control: serve.ts Sends it when Connect in
 * the tab says its `ke-connect` stopped.
 */

/** How long a computer taken offline at once has been silent: past Down, three Heartbeats of 15 s. */
export const SILENT_AT_ONCE = 60_000;

/** Why its `ke-connect` stopped on its own, as Connect in the tab said. */
const StoppedWhy = Schema.TaggedUnion({
  Forgotten: {},
  SignedOut: {},
  Outdated: { line: Schema.String },
  Taken: {},
});

const Model = Schema.Struct({
  /** Its Connection id. */
  id: Schema.String,
  /** Its Computer Name. */
  name: Schema.String,
  /** Who its `ke-connect` is signed in as. */
  email: Schema.String,
  /** The `ke-connect` version it runs. */
  version: Schema.String,
  online: Schema.Boolean,
  /** Set as it goes offline: how long Connect Cloud is to have heard nothing from it, in ms; null as it last reported. */
  silentFor: Schema.NullOr(Schema.Finite),
  /** Why its `ke-connect` last stopped on its own, until it comes online again. */
  stopped: Schema.NullOr(StoppedWhy),
});
export type ComputerModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls.
  /** It is switched off or loses its network; with `downAtOnce`, Connect Cloud last heard from it a minute ago. */
  GoOffline: { downAtOnce: Schema.Boolean },
  /** It is on and back on its network, `ke-connect` running again. */
  ComeOnline: {},
  /** The computer is gone, without a word to Connect Cloud. */
  Remove: {},

  // Sent by serve.ts.
  /** Its `ke-connect` stopped on its own. */
  StoppedOnItsOwn: { why: StoppedWhy },
});
export type ComputerMessage = typeof Message.Type;

/** A computer's Controls. */
export const COMPUTER_CONTROLS = [
  'GoOffline',
  'ComeOnline',
  'Remove',
] as const satisfies ReadonlyArray<ComputerMessage['_tag']>;

export const ComputerFake = Actor.define('Computer', {
  input: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    version: Schema.String,
  }),
  model: Model,
  message: Message,
  emits: { Removed: {} },
});

export const ComputerFakeLive = ComputerFake.build({
  init: ({ id, name, email, version }) => ({
    model: {
      id,
      name,
      email,
      version,
      online: true,
      silentFor: null,
      stopped: null,
    },
  }),
  children: { fileSystem: Actor.child(FileSystemFake) },
  on: {
    GoOffline: ({ downAtOnce }) => ({
      model: { online: false, silentFor: downAtOnce ? SILENT_AT_ONCE : null },
    }),
    ComeOnline: () => ({
      model: { online: true, silentFor: null, stopped: null },
    }),
    Remove: () => ({ emit: { _tag: 'Removed' } }),

    StoppedOnItsOwn: ({ why }) => ({ model: { stopped: why } }),
  },
});
