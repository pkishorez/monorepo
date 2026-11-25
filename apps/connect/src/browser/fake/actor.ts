import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { ComputerFakeLive } from './computer.js';

/*
 * The computers a person has, faked: a Kabuki Actor that Requires nothing
 * and starts blank, no computer. Each computer added is a keyed Child, by
 * its Connection id, `computer-1` and on, never one used before
 * (computer.ts).
 *
 * Its own Control adds a computer. A computer's own Controls are its
 * Child's, and its disk's are its File System's. `ComputerRemoved` is Sent
 * by a computer's slot when it Emits `Removed`.
 */

/** Who a computer's `ke-connect` is signed in as, when the person adding it says nobody. */
export const SIGNED_IN_AS = 'you@kestack.test';

/** The `ke-connect` a computer runs, when the person adding it says none: newer than any Minimum Connect yet. */
export const KE_CONNECT = '1.0.0';

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
});
export type ComputersModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls.
  /** A computer running `ke-connect`, online, its tunnel up and reached; blank fields take a plain default. */
  AddComputer: {
    name: Schema.String,
    keConnectVersion: Schema.String,
    signedInAs: Schema.String,
  },

  // Sent by a computer's slot.
  /** A computer is gone. */
  ComputerRemoved: { id: Schema.String },
});
export type ComputersMessage = typeof Message.Type;

/** The Computers Fake's own Controls. */
export const ROOT_CONTROLS = ['AddComputer'] as const satisfies ReadonlyArray<
  ComputersMessage['_tag']
>;

/** Blank: no computer. */
export const blank = (): ComputersModel => ({ computers: [], added: 0 });

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
    ComputerRemoved: ({ id }, { model }) => ({
      model: { computers: model.computers.filter((each) => each.id !== id) },
    }),
  },
});
