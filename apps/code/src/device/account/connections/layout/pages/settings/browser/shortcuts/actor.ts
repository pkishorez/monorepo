import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Preferences } from '../../../../../../../store.ts';
import { setBindings } from './commands.ts';
import {
  assign,
  Bindings,
  Clash,
  clashOf,
  reset,
  swapped,
  typesInField,
} from './bindings.ts';

/*
 * Shortcut settings: every Action and its keys, and changing them.
 *
 * 1. Read    the user's Bindings from Preferences, and again after every
 *            write to it, here or in another tab.
 * 2. Record  a row records one key press, which replaces that Action's
 *            Shortcuts; recording stops once a key is pressed, or when the
 *            View leaves the recording Surface, by Escape or a click away.
 * 3. Clash   a key another Action on the same Surface has is not saved:
 *            the row names the holder and offers to Swap their keys. Nor
 *            is a key that types, for an Action that works while typing:
 *            the row says to hold Ctrl, Alt or Cmd with it.
 * 4. Reset   one Action, or all of them, back to their defaults. One
 *            whose defaults another Action has now, as after Swaps,
 *            takes that one back to its defaults too, and so on; the
 *            row says which went with it.
 * Every change is saved to Preferences at once, and shown before it is
 * read back.
 */

const Model = Schema.Struct({
  /** Null until read. */
  bindings: Schema.NullOr(Bindings),
  query: Schema.String,
  /** The Action recording a key, by id. */
  recording: Schema.NullOr(Schema.String),
  clash: Schema.NullOr(Clash),
  /** A key refused because it would type: for which Action, and the key. */
  types: Schema.NullOr(
    Schema.Struct({ id: Schema.String, keys: Schema.String }),
  ),
  /** The Actions reset with the one reset, so its defaults Conflict with none. */
  alsoReset: Schema.NullOr(
    Schema.Struct({ id: Schema.String, also: Schema.Array(Schema.String) }),
  ),
});
type Model = typeof Model.Type;

const Shortcuts = Actor.define('Shortcuts', {
  requires: [Preferences],
  model: Model,
  message: Schema.TaggedUnion({
    Read: { bindings: Bindings },
    Searched: { query: Schema.String },
    Record: { id: Schema.String },
    /** The key pressed, as people write it. */
    Pressed: { keys: Schema.String },
    Stopped: {},
    Swap: {},
    Dismiss: {},
    Reset: { id: Schema.String },
    ResetAll: {},
  }),
});

const save = (model: Model, bindings: typeof Bindings.Type) => ({
  model: { ...model, bindings, clash: null, types: null, alsoReset: null },
  command: setBindings({ bindings }),
});

export const ShortcutsLive = Actor.build(Shortcuts, {
  init: () => ({
    model: {
      bindings: null,
      query: '',
      recording: null,
      clash: null,
      types: null,
      alsoReset: null,
    },
  }),
  workers: {
    // 1. Read
    read: {
      run: (self) =>
        Stream.runForEach(
          Stream.concat(Stream.make(undefined), Preferences.changes),
          () =>
            Effect.flatMap(Preferences.read, ({ bindings }) =>
              self.send({ _tag: 'Read', bindings }),
            ),
        ),
    },
  },
  on: {
    Read: ({ bindings }, { model }) => ({ model: { ...model, bindings } }),
    Searched: ({ query }, { model }) => ({ model: { ...model, query } }),
    // 2. Record
    Record: ({ id }, { model }) => ({
      model: {
        ...model,
        recording: id,
        clash: null,
        types: null,
        alsoReset: null,
      },
    }),
    Stopped: (_, { model }) => ({ model: { ...model, recording: null } }),
    Pressed: ({ keys }, { model }) => {
      const { recording: id, bindings } = model;
      if (id === null || bindings === null) return {};
      if (typesInField(id, keys))
        return { model: { ...model, recording: null, types: { id, keys } } };
      const next = assign(bindings, id, keys);
      const clash = clashOf(next, id);
      // 3. Clash
      if (clash !== null)
        return { model: { ...model, recording: null, clash } };
      return save({ ...model, recording: null }, next);
    },
    Swap: (_, { model }) => {
      if (model.clash === null || model.bindings === null) return {};
      const next = swapped(model.bindings, model.clash);
      return next === null ? {} : save(model, next);
    },
    Dismiss: (_, { model }) => ({
      model: { ...model, clash: null, types: null, alsoReset: null },
    }),
    // 4. Reset
    Reset: ({ id }, { model }) => {
      if (model.bindings === null) return {};
      const { bindings, also } = reset(model.bindings, id);
      const saved = save(model, bindings);
      return also.length === 0
        ? saved
        : { ...saved, model: { ...saved.model, alsoReset: { id, also } } };
    },
    ResetAll: (_, { model }) => save(model, {}),
  },
});
