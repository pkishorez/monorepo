import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

export const Door = Actor.define('Door', {
  // The three situations a door can be in. It is always in exactly one.
  state: Schema.TaggedUnion({ Locked: {}, Closed: {}, Open: {} }),
  // What it keeps in every State.
  model: Schema.Struct({ opened: Schema.Number }),
  message: Schema.TaggedUnion({
    Unlocked: {},
    Locked: {},
    Opened: {},
    Shut: {},
  }),
});

export const DoorLive = Actor.build(Door, {
  init: () => ({ state: { _tag: 'Locked' }, model: { opened: 0 } }),
  state: {
    // Each State lists only the Messages that make sense in it.
    Locked: {
      on: { Unlocked: () => ({ state: { _tag: 'Closed' } }) },
    },
    Closed: {
      on: {
        Opened: (_, { model }) => ({
          state: { _tag: 'Open' },
          model: { opened: model.opened + 1 },
        }),
        Locked: () => ({ state: { _tag: 'Locked' } }),
      },
    },
    Open: {
      on: { Shut: () => ({ state: { _tag: 'Closed' } }) },
    },
  },
});
