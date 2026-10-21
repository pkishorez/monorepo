import { Schema } from 'effect';

/*
 * What an Instance actor keeps, for its View and the Inspector: its Key,
 * whether its Gate is open, the Actions under way on it, and each Collection
 * whose Strategy stopped or keeps failing. Its State says whether it leads.
 */

export const Input = Schema.Struct({
  /** The Key as text. */
  key: Schema.String,
});

export const Model = Schema.Struct({
  key: Schema.String,
  gate: Schema.Boolean,
  /** The Actions under way on this Instance, by name, one entry each. */
  pending: Schema.Array(Schema.String),
  /** Collections that met an Entity newer than this app knows: their Strategy stops until a reload. */
  outdated: Schema.Array(Schema.String),
  /** Collections whose Strategy is failing now, and why; it tries again. */
  failing: Schema.Array(
    Schema.Struct({ collection: Schema.String, message: Schema.String }),
  ),
});

export const State = Schema.TaggedUnion({
  /** Another participant leads; this one reads what it stores. */
  Following: {},
  /** This participant runs the Strategies while the Gate is open. */
  Leading: {},
});

export const Message = Schema.TaggedUnion({
  Led: {},
  Gated: { open: Schema.Boolean },
  ActionBegan: { action: Schema.String },
  ActionEnded: { action: Schema.String },
  Outdated: { collection: Schema.String },
  Failed: { collection: Schema.String, message: Schema.String },
  Recovered: { collection: Schema.String },
});

export type Model = typeof Model.Type;
export type State = typeof State.Type;
export type Message = typeof Message.Type;

/** One entry of `action` taken out, the others kept. */
export const withoutOne = (list: ReadonlyArray<string>, action: string) => {
  const at = list.indexOf(action);
  return at === -1 ? list : [...list.slice(0, at), ...list.slice(at + 1)];
};
