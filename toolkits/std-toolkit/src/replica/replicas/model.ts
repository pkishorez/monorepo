import { Schema } from 'effect';

/*
 * What Replicas keeps: every Instance running here, who holds it, and when
 * it stops if no one does. How each Instance syncs is in its own Model.
 */

const Running = Schema.Struct({
  replica: Schema.String,
  /** The Key as text. */
  key: Schema.String,
  /** Who holds it: the Query, Action or Worker that got it, one entry each. */
  holders: Schema.Array(Schema.String),
  /** When it stops, in milliseconds since 1970, unless held again first; `null` while held, or kept. */
  gcAt: Schema.NullOr(Schema.Number),
});

export const Model = Schema.Struct({
  instances: Schema.Array(Running),
});

const At = { replica: Schema.String, key: Schema.String };

export const Message = Schema.TaggedUnion({
  Held: { ...At, holder: Schema.String },
  /** `at` is the real time it was let go, in milliseconds since 1970. */
  Released: { ...At, holder: Schema.String, at: Schema.Number },
  /** Its GC Time ran out with no one holding it. */
  Collected: { ...At, until: Schema.Number },
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

/** Held: it runs, or keeps running, and stops counting down. */
export const held = (model: Model, where: Where, holder: string): Model =>
  model.instances.some(is(where))
    ? change(model, where, (running) => ({
        ...running,
        holders: [...running.holders, holder],
        gcAt: null,
      }))
    : {
        ...model,
        instances: [
          ...model.instances,
          { ...where, holders: [holder], gcAt: null },
        ],
      };

/** Let go: once no one holds it, it stops after `gcTime`, or never with `Infinity`. */
export const released = (
  model: Model,
  where: Where,
  holder: string,
  at: number,
  gcTime: number,
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
    const counts = holders.length === 0 && gcTime !== Infinity;
    return {
      ...running,
      holders,
      gcAt: counts ? at + gcTime : running.gcAt,
    };
  });

/** Its GC Time ran out: it stops, if no one held it again meanwhile. */
export const collected = (model: Model, where: Where, until: number): Model =>
  model.instances.some(
    (running) =>
      is(where)(running) &&
      running.holders.length === 0 &&
      running.gcAt === until,
  )
    ? remove(model, where)
    : model;

export const dropped = remove;
