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
 *           once, with an empty home; its id is `computer-<n>`, counting
 *           every computer added, so no id is ever given twice, even one
 *           whose computer was removed.
 * - Each    a computer goes offline, comes back online, which clears why
 *           it last stopped, or is removed; its disk gets a sample project,
 *           a folder or a file. Each names the computer by its id or its
 *           name, the id first.
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
  /** How many computers were ever added: the next one's number, less one. */
  added: Schema.Int,
});
export type ComputersState = typeof ComputersState.Type;

type State = SubscriptionRef.SubscriptionRef<ComputersState>;

/** The id of the computer named `given`, by its id or else its name; null when none is. */
const idOf = (
  computers: ReadonlyArray<ComputerState>,
  given: string,
): string | null =>
  (
    computers.find(({ id }) => id === given) ??
    computers.find(({ name }) => name === given)
  )?.id ?? null;

const noComputer = (given: string) => `No computer is ${given}.`;

/** The computer `given` names changed by `change`, or why not: none is it. */
const changeComputer = (
  state: State,
  given: string,
  change: (computer: ComputerState) => ComputerState,
) =>
  SubscriptionRef.updateEffect(state, ({ computers, added }) => {
    const id = idOf(computers, given);
    return id === null
      ? Effect.fail(noComputer(given))
      : Effect.succeed({
          added,
          computers: computers.map((each) =>
            each.id === id ? change(each) : each,
          ),
        });
  });

/** A control on one computer, by its id or name. */
const onComputer = <P extends { readonly computer: string }>(
  payload: Schema.Codec<P, unknown, never, never>,
  change: (payload: P) => (computer: ComputerState) => ComputerState,
) =>
  Fake.control(ComputersState, payload, (given, state) =>
    changeComputer(state, given.computer, change(given)),
  );

/** A control on one computer's disk, by its id or name. */
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
  initial: { computers: [], added: 0 },
  controls: {
    AddComputer: Fake.control(
      ComputersState,
      Schema.Struct({
        name: Schema.String,
        signedInAs: Schema.optionalKey(Schema.String),
        keConnectVersion: Schema.optionalKey(Schema.String),
      }).annotate({
        description: `A computer running ke-connect, online: a Connection of the Account signedInAs, by default ${SIGNED_IN_AS}. Add it before signing in: an app signed in already lists it only after reloading its Connections.`,
      }),
      ({ name, keConnectVersion = '', signedInAs = '' }, state) =>
        SubscriptionRef.update(state, ({ computers, added }) => {
          const id = `computer-${added + 1}`;
          return {
            added: added + 1,
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
    GoOffline: onComputer(
      Schema.Struct({
        computer: Schema.String,
        downAtOnce: Schema.optionalKey(Schema.Boolean),
      }).annotate({
        description:
          'The computer, by name or id, is switched off or loses its network; downAtOnce: Connect Cloud last heard from it a minute ago.',
      }),
      ({ downAtOnce }) =>
        (computer) => ({
          ...computer,
          online: false,
          silentFor: downAtOnce ? SILENT_AT_ONCE : null,
        }),
    ),
    ComeOnline: onComputer(
      Schema.Struct({ computer: Schema.String }).annotate({
        description:
          'The computer is on and back on its network, ke-connect running again.',
      }),
      () => (computer) => ({
        ...computer,
        online: true,
        silentFor: null,
        stopped: null,
      }),
    ),
    Remove: Fake.control(
      ComputersState,
      Schema.Struct({ computer: Schema.String }).annotate({
        description: 'The computer is gone, without a word to Connect Cloud.',
      }),
      ({ computer }, state) =>
        SubscriptionRef.updateEffect(state, ({ computers, added }) => {
          const id = idOf(computers, computer);
          return id === null
            ? Effect.fail(noComputer(computer))
            : Effect.succeed({
                added,
                computers: computers.filter((each) => each.id !== id),
              });
        }),
    ),
    AddSampleProject: onDisk(
      Schema.Struct({
        computer: Schema.String,
        folder: Schema.String,
      }).annotate({
        description:
          'A folder on its disk, such as /home/you/demo, which an app names from home, ~/demo, with a few files and a git repository on main, branches and an Origin.',
      }),
      ({ folder }) => addSampleProject(folder),
    ),
    AddFolder: onDisk(
      Schema.Struct({
        computer: Schema.String,
        folder: Schema.String,
      }).annotate({
        description:
          'An empty folder on its disk, with every folder on the way.',
      }),
      ({ folder }) => addFolder(folder),
    ),
    AddFile: onDisk(
      Schema.Struct({
        computer: Schema.String,
        file: Schema.String,
        text: Schema.String,
      }).annotate({ description: 'A file on its disk holding the text.' }),
      ({ file, text }) => addFile(file, text),
    ),
  },
  layer: computersOver,
});
