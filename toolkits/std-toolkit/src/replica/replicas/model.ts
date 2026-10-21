import { Schema } from 'effect';

/*
 * What Replicas keeps: every Instance running here, who holds it, and when
 * it stops if no one does. Each Instance's role and Gate come in as it
 * reports them, so the Inspector sees the whole picture in one Model.
 */

const Running = Schema.Struct({
  replica: Schema.String,
  /** The Key as text. */
  key: Schema.String,
  role: Schema.Literals(['leading', 'following']),
  gate: Schema.Boolean,
  /** Who holds it: the Query, Action or Worker that got it, one entry each. */
  holders: Schema.Array(Schema.String),
  /** When it stops, in milliseconds since 1970, unless held again first; `null` while held or kept. */
  lingeringUntil: Schema.NullOr(Schema.Number),
});

export const Model = Schema.Struct({
  /** How long an Instance runs on after its last holder lets go, in milliseconds. */
  linger: Schema.Number,
  /** Replicas whose Instances, once started, run until the Store removes them. */
  keep: Schema.Array(Schema.String),
  instances: Schema.Array(Running),
});

const At = { replica: Schema.String, key: Schema.String };

export const Message = Schema.TaggedUnion({
  Configured: { linger: Schema.Number, keep: Schema.Array(Schema.String) },
  Held: { ...At, holder: Schema.String },
  /** `at` is the real time it was let go, in milliseconds since 1970. */
  Released: { ...At, holder: Schema.String, at: Schema.Number },
  Lingered: { ...At, until: Schema.Number },
  Reported: {
    ...At,
    role: Schema.Literals(['leading', 'following']),
    gate: Schema.Boolean,
  },
  /** The Store is removing it: it stops, whoever holds it. */
  Dropped: At,
});

export type Model = typeof Model.Type;
export type Message = typeof Message.Type;
export type Running = (typeof Model.Type)['instances'][number];

type Where = { readonly replica: string; readonly key: string };

const is =
  ({ replica, key }: Where) =>
  (running: Running) =>
    running.replica === replica && running.key === key;

const change = (
  model: Model,
  where: Where,
  update: (running: Running) => Running,
): Model => ({
  ...model,
  instances: model.instances.map((running) =>
    is(where)(running) ? update(running) : running,
  ),
});

const remove = (model: Model, where: Where): Model => ({
  ...model,
  instances: model.instances.filter((running) => !is(where)(running)),
});

/** Held: it runs, or keeps running, and stops lingering. */
export const held = (model: Model, where: Where, holder: string): Model =>
  model.instances.some(is(where))
    ? change(model, where, (running) => ({
        ...running,
        holders: [...running.holders, holder],
        lingeringUntil: null,
      }))
    : {
        ...model,
        instances: [
          ...model.instances,
          {
            ...where,
            role: 'following',
            gate: false,
            holders: [holder],
            lingeringUntil: null,
          },
        ],
      };

/** Let go: once no one holds it, it lingers, unless its Replica is kept. */
export const released = (
  model: Model,
  where: Where,
  holder: string,
  at: number,
): Model =>
  change(model, where, (running) => {
    const index = running.holders.indexOf(holder);
    const holders =
      index === -1
        ? running.holders
        : [
            ...running.holders.slice(0, index),
            ...running.holders.slice(index + 1),
          ];
    const lingers =
      holders.length === 0 && !model.keep.includes(running.replica);
    return {
      ...running,
      holders,
      lingeringUntil: lingers ? at + model.linger : running.lingeringUntil,
    };
  });

/** Its linger ran out: it stops, if no one held it again meanwhile. */
export const lingered = (model: Model, where: Where, until: number): Model =>
  model.instances.some(
    (running) =>
      is(where)(running) &&
      running.holders.length === 0 &&
      running.lingeringUntil === until,
  )
    ? remove(model, where)
    : model;

export const reported = (
  model: Model,
  where: Where,
  status: Pick<Running, 'role' | 'gate'>,
): Model => change(model, where, (running) => ({ ...running, ...status }));

export const dropped = remove;
