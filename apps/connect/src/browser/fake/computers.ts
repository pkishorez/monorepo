import { Effect, Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import {
  addFile,
  addFolder,
  addSampleProject,
  type DiskChange,
  emptyHome,
  FileSystemState,
} from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import { computersOver } from './layer.js';

/*
 * The Computers fake: the computers a person has, each running
 * `ke-connect` with its own disk. Its state is each computer as it is now,
 * in a person's words: what it runs and who it is signed in as, on or off,
 * why its `ke-connect` last stopped, and its disk (the File System fake's
 * state). It starts with none. layer.ts reads it into what Connect in the
 * tab reads, `Computers`.
 *
 * - Add     a computer added comes up online, its tunnel up and reached at
 *           once, with an empty home; its id is `computer-<n>`, one past
 *           the highest there, so none there is ever named twice.
 * - Each    a computer goes offline, comes back online, which clears why
 *           it last stopped, or is removed; its disk gets a sample project,
 *           a folder or a file. Each names the computer by its id.
 *
 * Why a `ke-connect` stopped is no control: layer.ts sets it when Connect
 * in the tab says so.
 */

/** Who a computer's `ke-connect` is signed in as, when the person adding it says nobody. */
export const SIGNED_IN_AS = 'you@kestack.test';

/** The `ke-connect` a computer runs, when the person adding it says none: newer than any Minimum Connect yet. */
export const KE_CONNECT = '1.0.0';

/** How long a computer taken offline at once has been silent: past Down, three Heartbeats of 15 s. */
export const SILENT_AT_ONCE = 60_000;

/** Why its `ke-connect` stopped on its own, as Connect in the tab said. */
const StoppedWhy = Schema.TaggedUnion({
  Forgotten: {},
  SignedOut: {},
  Outdated: { line: Schema.String },
  Taken: {},
});

const Computer = Schema.Struct({
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
  /** Its disk. */
  disk: FileSystemState,
});
export type ComputerState = typeof Computer.Type;

export const ComputersState = Schema.Struct({
  /** Every computer, in the order added. */
  computers: Schema.Array(Computer),
});
export type ComputersState = typeof ComputersState.Type;

type State = SubscriptionRef.SubscriptionRef<ComputersState>;

/** The number in a `computer-<n>` id; 0 for any other. */
const numberOf = (id: string) => Number(/^computer-(\d+)$/.exec(id)?.[1] ?? 0);

/** `id` changed by `change`, or why not: no computer has it. */
const changeComputer = (
  state: State,
  id: string,
  change: (computer: ComputerState) => ComputerState,
) =>
  SubscriptionRef.updateEffect(state, ({ computers }) =>
    computers.some((each) => each.id === id)
      ? Effect.succeed({
          computers: computers.map((each) =>
            each.id === id ? change(each) : each,
          ),
        })
      : Effect.fail(`No computer is ${id}.`),
  );

/** A control on one computer, by its id. */
const onComputer = <P extends { readonly computer: string }>(
  payload: Schema.Codec<P, unknown, never, never>,
  change: (payload: P) => (computer: ComputerState) => ComputerState,
) =>
  Fake.control(ComputersState, payload, (given, state) =>
    changeComputer(state, given.computer, change(given)),
  );

/** A control on one computer's disk, by its id. */
const onDisk = <P extends { readonly computer: string }>(
  payload: Schema.Codec<P, unknown, never, never>,
  change: (payload: P) => DiskChange,
) =>
  onComputer(payload, (given) => (computer) => ({
    ...computer,
    disk: change(given)(computer.disk),
  }));

/** The Computers fake. Its Layer gives `Computers`, what `inTab` runs against. */
export const computers = Fake.make({
  name: 'computers',
  state: ComputersState,
  initial: { computers: [] },
  controls: {
    /** A computer running `ke-connect`, online, its tunnel up and reached; blank fields take a plain default. */
    AddComputer: Fake.control(
      ComputersState,
      Schema.Struct({
        name: Schema.String,
        keConnectVersion: Schema.String,
        signedInAs: Schema.String,
      }),
      ({ name, keConnectVersion, signedInAs }, state) =>
        SubscriptionRef.update(state, ({ computers }) => {
          const highest = Math.max(
            0,
            ...computers.map(({ id }) => numberOf(id)),
          );
          const id = `computer-${highest + 1}`;
          return {
            computers: [
              ...computers,
              {
                id,
                name: name.trim().slice(0, 64) || id,
                email: signedInAs.trim() || SIGNED_IN_AS,
                version: keConnectVersion.trim() || KE_CONNECT,
                online: true,
                silentFor: null,
                stopped: null,
                disk: emptyHome,
              },
            ],
          };
        }),
    ),
    /** It is switched off or loses its network; with `downAtOnce`, Connect Cloud last heard from it a minute ago. */
    GoOffline: onComputer(
      Schema.Struct({ computer: Schema.String, downAtOnce: Schema.Boolean }),
      ({ downAtOnce }) =>
        (computer) => ({
          ...computer,
          online: false,
          silentFor: downAtOnce ? SILENT_AT_ONCE : null,
        }),
    ),
    /** It is on and back on its network, `ke-connect` running again. */
    ComeOnline: onComputer(
      Schema.Struct({ computer: Schema.String }),
      () => (computer) => ({
        ...computer,
        online: true,
        silentFor: null,
        stopped: null,
      }),
    ),
    /** The computer is gone, without a word to Connect Cloud. */
    Remove: Fake.control(
      ComputersState,
      Schema.Struct({ computer: Schema.String }),
      ({ computer }, state) =>
        SubscriptionRef.updateEffect(state, ({ computers }) =>
          computers.some(({ id }) => id === computer)
            ? Effect.succeed({
                computers: computers.filter(({ id }) => id !== computer),
              })
            : Effect.fail(`No computer is ${computer}.`),
        ),
    ),
    /** A project on its disk, with a few files and a git repository on `main`, with branches and an Origin. */
    AddSampleProject: onDisk(
      Schema.Struct({ computer: Schema.String, folder: Schema.String }),
      ({ folder }) => addSampleProject(folder),
    ),
    /** A folder on its disk, with every folder on the way; one named `.something` is hidden. */
    AddFolder: onDisk(
      Schema.Struct({ computer: Schema.String, folder: Schema.String }),
      ({ folder }) => addFolder(folder),
    ),
    /** A file on its disk holding the text given. */
    AddFile: onDisk(
      Schema.Struct({
        computer: Schema.String,
        file: Schema.String,
        text: Schema.String,
      }),
      ({ file, text }) => addFile(file, text),
    ),
  },
  layer: computersOver,
});
