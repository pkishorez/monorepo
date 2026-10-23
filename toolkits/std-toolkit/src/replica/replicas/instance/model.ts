import { Schema } from 'effect';
import { workerKey } from './windows.js';

/*
 * What an Instance actor keeps, for its View and the Inspector: its Key,
 * whether its Gate is open, the Actions under way on it, and per Collection
 * how its Strategies are doing: the whole Collection's, and each open
 * Window's, with who uses it and when it closes, and which are Caught Up.
 * Its State says whether it leads.
 */

export const Input = Schema.Struct({
  /** The Key as text. */
  key: Schema.String,
});

/** What a Window's field reads. */
export const WindowValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
]);

export type WindowValue = typeof WindowValue.Type;

/**
 * How one Strategy is doing: `idle` while another participant leads,
 * `gated` while the Gate is closed, `running`, `failing` while it tries
 * again, or `outdated`: it met an Entity newer than this app knows and
 * stops until a reload.
 */
const Status = Schema.Literals([
  'idle',
  'gated',
  'running',
  'failing',
  'outdated',
]);

export type Status = typeof Status.Type;

const Run = {
  status: Status,
  /** Why it is failing, while it is. */
  problem: Schema.NullOr(Schema.String),
};

const Window = Schema.Struct({
  path: Schema.String,
  value: WindowValue,
  /** How many Queries here use it now. */
  users: Schema.Number,
  /** Whether it is open here: in use, or within its GC Time. */
  here: Schema.Boolean,
  /** When it closes here, in milliseconds since 1970, unless used again first; `null` while used, or kept. */
  gcAt: Schema.NullOr(Schema.Number),
  /** Whether another participant has it open: the Leader runs it for them. */
  elsewhere: Schema.Boolean,
  ...Run,
});

export type Window = typeof Window.Type;

const Synced = Schema.Struct({
  collection: Schema.String,
  /** The whole Collection's Strategy, if it has one. */
  strategy: Schema.NullOr(Schema.Struct(Run)),
  windows: Schema.Array(Window),
});

export type Synced = typeof Synced.Type;

export const Model = Schema.Struct({
  key: Schema.String,
  gate: Schema.Boolean,
  /** The Actions under way on this Instance, by name, one entry each. */
  pending: Schema.Array(Schema.String),
  /** The Collections with a Strategy or Windows. */
  collections: Schema.Array(Synced),
  /**
   * The Strategy scopes Caught Up, by Worker key, as `entries/wallet="w1"`:
   * its own while it leads, what the Leader told while it follows.
   */
  caughtUp: Schema.Array(Schema.String),
});

export const State = Schema.TaggedUnion({
  /** Another participant leads; this one reads what it stores. */
  Following: {},
  /** This participant runs the Strategies while the Gate is open. */
  Leading: {},
});

/** One Window of a Collection. */
const At = {
  collection: Schema.String,
  path: Schema.String,
  value: WindowValue,
};

/** A Strategy's scope: the whole Collection's, with no Window, or one Window's. */
const Scope = {
  collection: Schema.String,
  window: Schema.NullOr(
    Schema.Struct({ path: Schema.String, value: WindowValue }),
  ),
};

export const Message = Schema.TaggedUnion({
  Led: {},
  Gated: { open: Schema.Boolean },
  ActionBegan: { action: Schema.String },
  ActionEnded: { action: Schema.String },
  /** A Query here filters on it. */
  WindowOpened: At,
  /** A Query here stopped filtering on it; `at` is the real time, in milliseconds since 1970. */
  WindowReleased: { ...At, at: Schema.Number },
  /** Its GC Time ran out with nothing here using it. */
  WindowClosed: { ...At, until: Schema.Number },
  /** The Windows other participants have open, as the Leader read them. */
  Announced: { windows: Schema.Array(Schema.Struct(At)) },
  Outdated: Scope,
  Failed: { ...Scope, message: Schema.String },
  Recovered: Scope,
  /** A Strategy this participant runs had its first answer from the Backend. */
  Answered: Scope,
  /** The scopes the Leader says are Caught Up, once what they read shows here. */
  Told: { scopes: Schema.Array(Schema.String) },
});

export type Model = typeof Model.Type;
export type State = typeof State.Type;
export type Message = typeof Message.Type;

/** One entry of `action` taken out, the others kept. */
export const withoutOne = (list: ReadonlyArray<string>, action: string) => {
  const at = list.indexOf(action);
  return at === -1 ? list : [...list.slice(0, at), ...list.slice(at + 1)];
};

type Run = { readonly status: Status; readonly problem: string | null };
type Where = {
  readonly collection: string;
  readonly path: string;
  readonly value: WindowValue;
};

/** Whether a Strategy runs now, by the State and the Gate; failing and outdated stay as they are while it may. */
const settled = <S extends Run>(run: S, leading: boolean, gate: boolean): S =>
  run.status === 'outdated'
    ? run
    : !leading
      ? { ...run, status: 'idle', problem: null }
      : !gate
        ? { ...run, status: 'gated', problem: null }
        : run.status === 'failing'
          ? run
          : { ...run, status: 'running', problem: null };

/** Every Strategy's status again, after the State or the Gate changed. */
export const resettled = (model: Model, leading: boolean): Model => ({
  ...model,
  collections: model.collections.map((synced) => ({
    ...synced,
    strategy: synced.strategy && settled(synced.strategy, leading, model.gate),
    windows: synced.windows.map((window) =>
      settled(window, leading, model.gate),
    ),
  })),
});

const isWindow =
  ({ path, value }: { readonly path: string; readonly value: WindowValue }) =>
  (window: Window) =>
    window.path === path && window.value === value;

const inCollection = (
  model: Model,
  collection: string,
  update: (synced: Synced) => Synced,
): Model => ({
  ...model,
  collections: model.collections.map((synced) =>
    synced.collection === collection ? update(synced) : synced,
  ),
});

/** Changes one Window, adding it first, if it is new, from `fresh`. */
const changeWindow = (
  model: Model,
  where: Where,
  leading: boolean,
  update: (window: Window) => Window,
): Model =>
  inCollection(model, where.collection, (synced) => {
    const found = synced.windows.find(isWindow(where));
    const fresh: Window = settled(
      {
        path: where.path,
        value: where.value,
        users: 0,
        here: false,
        gcAt: null,
        elsewhere: false,
        status: 'idle',
        problem: null,
      },
      leading,
      model.gate,
    );
    const next = update(found ?? fresh);
    return {
      ...synced,
      windows: found
        ? synced.windows.map((window) => (window === found ? next : window))
        : [...synced.windows, next],
    };
  });

/** Opened by a Query here: it runs, or keeps running, and stops closing. */
export const opened = (model: Model, where: Where, leading: boolean): Model =>
  changeWindow(model, where, leading, (window) => ({
    ...window,
    users: window.users + 1,
    here: true,
    gcAt: null,
  }));

/** Let go by a Query here: once none uses it, it closes after `gcTime`, or never with `Infinity`. */
export const released = (
  model: Model,
  where: Where,
  at: number,
  gcTime: number,
): Model =>
  inCollection(model, where.collection, (synced) => ({
    ...synced,
    windows: synced.windows.map((window) => {
      if (!isWindow(where)(window) || window.users === 0) return window;
      const users = window.users - 1;
      return {
        ...window,
        users,
        gcAt: users === 0 && gcTime !== Infinity ? at + gcTime : null,
      };
    }),
  }));

/** Its GC Time ran out: it closes here, unless used again meanwhile, and goes unless open elsewhere. */
export const closed = (model: Model, where: Where, until: number): Model =>
  inCollection(model, where.collection, (synced) => ({
    ...synced,
    windows: synced.windows.flatMap((window) =>
      isWindow(where)(window) && window.users === 0 && window.gcAt === until
        ? window.elsewhere
          ? [{ ...window, here: false, gcAt: null }]
          : []
        : [window],
    ),
  }));

/** The Windows open elsewhere now: new ones run, and one no one has open any more goes. */
export const announced = (
  model: Model,
  windows: ReadonlyArray<Where>,
  leading: boolean,
): Model => {
  const marked: Model = {
    ...model,
    collections: model.collections.map((synced) => ({
      ...synced,
      windows: synced.windows.flatMap((window) => {
        const elsewhere = windows.some(
          (each) =>
            each.collection === synced.collection && isWindow(each)(window),
        );
        return window.here || elsewhere ? [{ ...window, elsewhere }] : [];
      }),
    })),
  };
  return windows.reduce(
    (model, where) =>
      changeWindow(model, where, leading, (window) => ({
        ...window,
        elsewhere: true,
      })),
    marked,
  );
};

/** How a running Strategy is doing, by its scope: one that stopped meanwhile keeps its status. */
export const reported = (
  model: Model,
  scope: {
    readonly collection: string;
    readonly window: {
      readonly path: string;
      readonly value: WindowValue;
    } | null;
  },
  run: Run,
): Model =>
  inCollection(model, scope.collection, (synced) => {
    const { window } = scope;
    const next = <S extends Run>(current: S): S =>
      current.status === 'running' || current.status === 'failing'
        ? { ...current, ...run }
        : current;
    return window === null
      ? { ...synced, strategy: synced.strategy && next(synced.strategy) }
      : {
          ...synced,
          windows: synced.windows.map((each) =>
            isWindow(window)(each) ? next(each) : each,
          ),
        };
  });

/** A scope whose Strategy runs, or ran to its end, keeps its Caught Up; one stopped loses it. */
const answering = (status: Status) =>
  status === 'running' || status === 'failing' || status === 'outdated';

/** The Worker key of each scope whose Strategy may be answering. */
const answeringKeys = (model: Model) =>
  new Set(
    model.collections.flatMap((synced) => [
      ...(synced.strategy && answering(synced.strategy.status)
        ? [workerKey(synced.collection, null)]
        : []),
      ...synced.windows
        .filter((window) => answering(window.status))
        .map((window) => workerKey(synced.collection, window)),
    ]),
  );

/** While it leads: only the scopes whose Strategy still runs stay Caught Up. */
export const stillCaughtUp = (model: Model): Model => {
  const keys = answeringKeys(model);
  const caughtUp = model.caughtUp.filter((key) => keys.has(key));
  return caughtUp.length === model.caughtUp.length
    ? model
    : { ...model, caughtUp };
};

/** A Strategy that runs had its first answer: its scope is Caught Up. */
export const answered = (
  model: Model,
  scope: {
    readonly collection: string;
    readonly window: {
      readonly path: string;
      readonly value: WindowValue;
    } | null;
  },
): Model => {
  const key = workerKey(scope.collection, scope.window);
  return model.caughtUp.includes(key) || !answeringKeys(model).has(key)
    ? model
    : { ...model, caughtUp: [...model.caughtUp, key] };
};
