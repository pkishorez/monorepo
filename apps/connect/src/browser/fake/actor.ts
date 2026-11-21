import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { ComputerFakeLive } from './computer.js';

/*
 * The computers a person has, and Connect Cloud's own conditions, faked: a
 * Kabuki Actor that Requires nothing and starts blank, no computer and
 * Connect Cloud as deployed. Each computer added is a keyed Child, by its
 * Connection id, `computer-1` and on, never one used before (computer.ts).
 *
 * Its own Controls add a computer, and set what Connect Cloud is deployed
 * with: in reach or not, its Minimum Connect (blank for the one deployed),
 * and the code Plugin Release it names. A computer's own Controls are
 * its Child's, and its disk's are its File System's. `ComputerRemoved` is
 * Sent by a computer's slot when it Emits `Removed`.
 *
 * `untilReload` holds what makes the App the older side, the Release
 * Connect Cloud names: a reload, which is how an App moves to its newest
 * build, ends it (index.ts, `kept`).
 */

/** Who a computer's `ke-connect` is signed in as, when the person adding it says nobody. */
export const SIGNED_IN_AS = 'you@kestack.test';

/** The `ke-connect` a computer runs, when the person adding it says none: newer than any Minimum Connect yet. */
export const KE_CONNECT = '1.0.0';

/** The code Plugin Release Connect Cloud names: the App's own, a newer one, or an older one (computers/). */
const CloudRelease = Schema.Literals(['TheApps', 'Newer', 'Older']);

const Model = Schema.Struct({
  /** Every computer, as it was added: what its Child starts from. */
  computers: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      email: Schema.String,
      version: Schema.String,
    }),
  ),
  /** How many computers were ever added, for the next id. */
  added: Schema.Int,
  cloud: Schema.Struct({
    /** Whether Connect Cloud answers. */
    reachable: Schema.Boolean,
    /** Its Minimum Connect; null for the one deployed. */
    minConnect: Schema.NullOr(Schema.String),
  }),
  /** Gone with a reload: what makes the App the older side. */
  untilReload: Schema.Struct({
    /** The code Plugin Release Connect Cloud names. */
    cloudRelease: CloudRelease,
  }),
});
export type ComputersModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls.
  /** A computer running `ke-connect`, online; blank fields take a plain default. */
  AddComputer: {
    name: Schema.String,
    keConnectVersion: Schema.String,
    signedInAs: Schema.String,
  },
  /** Connect Cloud does not answer, as when the network to it is down. */
  PutCloudOutOfReach: {},
  /** Connect Cloud answers again. */
  BringCloudBack: {},
  /** Connect Cloud's Minimum Connect; blank for the one deployed. */
  SetMinimumConnect: { version: Schema.String },
  /** Connect Cloud names this App's own Release of the code Plugin. */
  CloudNamesThisAppsRelease: {},
  /** Connect Cloud names a newer Release than this App's: this App is behind. */
  CloudNamesANewerRelease: {},
  /** Connect Cloud names an older Release, and has never heard of this App's: it is behind. */
  CloudNamesAnOlderRelease: {},

  // Sent by a computer's slot.
  /** A computer is gone. */
  ComputerRemoved: { id: Schema.String },
});
export type ComputersMessage = typeof Message.Type;

/** The Computers Fake's own Controls. */
export const ROOT_CONTROLS = [
  'AddComputer',
  'PutCloudOutOfReach',
  'BringCloudBack',
  'SetMinimumConnect',
  'CloudNamesThisAppsRelease',
  'CloudNamesANewerRelease',
  'CloudNamesAnOlderRelease',
] as const satisfies ReadonlyArray<ComputersMessage['_tag']>;

/** Blank: no computer, Connect Cloud as deployed. */
export const blank = (): ComputersModel => ({
  computers: [],
  added: 0,
  cloud: { reachable: true, minConnect: null },
  untilReload: { cloudRelease: 'TheApps' },
});

export const ComputersFake = Actor.define('Computers', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  children: {
    computers: Actor.child(ComputerFakeLive, {
      each: ({ model }) => model.computers.map(({ id }) => id),
      input: ({ model }, id) =>
        model.computers.find((each) => each.id === id) ?? {
          id,
          name: id,
          email: SIGNED_IN_AS,
          version: KE_CONNECT,
        },
      emits: { Removed: (_, id) => ({ _tag: 'ComputerRemoved', id }) },
    }),
  },
  on: {
    AddComputer: ({ name, keConnectVersion, signedInAs }, { model }) => {
      const added = model.added + 1;
      const id = `computer-${added}`;
      return {
        model: {
          added,
          computers: [
            ...model.computers,
            {
              id,
              name: name.trim().slice(0, 64) || id,
              email: signedInAs.trim() || SIGNED_IN_AS,
              version: keConnectVersion.trim() || KE_CONNECT,
            },
          ],
        },
      };
    },
    PutCloudOutOfReach: (_, { model }) => ({
      model: { cloud: { ...model.cloud, reachable: false } },
    }),
    BringCloudBack: (_, { model }) => ({
      model: { cloud: { ...model.cloud, reachable: true } },
    }),
    SetMinimumConnect: ({ version }, { model }) => ({
      model: { cloud: { ...model.cloud, minConnect: version.trim() || null } },
    }),
    CloudNamesThisAppsRelease: () => ({
      model: { untilReload: { cloudRelease: 'TheApps' } },
    }),
    CloudNamesANewerRelease: () => ({
      model: { untilReload: { cloudRelease: 'Newer' } },
    }),
    CloudNamesAnOlderRelease: () => ({
      model: { untilReload: { cloudRelease: 'Older' } },
    }),
    ComputerRemoved: ({ id }, { model }) => ({
      model: { computers: model.computers.filter((each) => each.id !== id) },
    }),
  },
});
