import { Schema } from 'effect';
import { Rpc, RpcGroup, RpcSerialization } from 'effect/rpc';
import type { RpcClient, RpcClientError } from 'effect/rpc';

/*
 * The Kabuki Session Api: what one running Kabuki app answers about
 * itself. The tab computes; every answer is a result, as plain JSON, and
 * every value of the app's own is its Actor's Schemas' encoded side.
 *
 * 1. Words     Step, Entry, the Snapshot, the graph the canvas draws, the
 *              Blueprint, one Instance's card and its Trail, as Schemas.
 *              An Instance is named by its Address; a card of the
 *              Blueprint by its place.
 * 2. Errors    a Step no longer kept, a path or an Instance not there,
 *              each saying what is there instead.
 * 3. Methods   read the History, a Branch at a time, the Snapshot, a
 *              Step's changes, the graph, the Blueprint, a card and an
 *              Instance's Trail; watch for changes, and the page as it
 *              moves; Seek a Step in the app, and Fork it.
 * 4. Wire      the path a Kabuki Session dials, the query it dials with,
 *              and the serialization both sides speak.
 *
 * The connection is reversed: the app dials DevTools and serves this Api
 * over that socket, and DevTools is its client. Right after the socket
 * opens, DevTools calls `named` with the name it gave the Kabuki Session:
 * the one asked for, or that name with `-2`, `-3` on a clash.
 */

// 1. Words
/** A Step: right after an entry, by its id, or right after init. */
export const Step = Schema.Union([Schema.Number, Schema.Literal('init')]);
export type Step = typeof Step.Type;

export const Outcome = Schema.Literals(['handled', 'ignored', 'dropped']);

/** Who Sent a Message, as Kabuki's `From`. */
export const From = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('view'), instance: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('command'),
    instance: Schema.String,
    name: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('worker'),
    instance: Schema.String,
    name: Schema.String,
    key: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal('provides'), instance: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('emit'),
    instance: Schema.String,
    name: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('outside'),
    name: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal('restore') }),
]);

/** One History entry: a Message, the Instance it was for, and what came of it. */
export const Entry = Schema.Struct({
  id: Schema.Number,
  /** The entry before it, or `null` right after init. */
  parent: Schema.NullOr(Schema.Number),
  /** The Address of the Instance it was Sent to. */
  to: Schema.String,
  /** The Message, as its Actor's Schema encodes it. */
  message: Schema.Unknown,
  /** The Message's `_tag`. */
  tag: Schema.String,
  from: From,
  /** Its Time, in milliseconds. */
  at: Schema.Number,
  outcome: Outcome,
});
export type Entry = typeof Entry.Type;

/** Who the Kabuki Session is. */
export const Info = Schema.Struct({
  /** The app: its root Actor's name. */
  app: Schema.String,
  /** The page it runs in. */
  url: Schema.String,
  /** The Kabuki Session's name, as DevTools last named it. */
  name: Schema.String,
});
export type Info = typeof Info.Type;

/** Where the app is: its Head, and the Step it Seeks. */
export const Now = Schema.Struct({
  head: Schema.NullOr(Schema.Number),
  /** How many entries the Head's Branch keeps. */
  size: Schema.Number,
  /** The Step the app Seeks, drawn in place of its Head; `null` while it draws its Head. */
  seeking: Schema.NullOr(Step),
  /** Whether the app's Runtime is running, or stopped. */
  running: Schema.Boolean,
  /** Why the app's last Seek, start, stop or Fork failed; `null` once one succeeds. */
  failure: Schema.NullOr(Schema.String),
  /** Counts every change heard since watching began, a Worker's too, so equal values still say something moved. */
  revision: Schema.Number,
});
export type Now = typeof Now.Type;

/**
 * A Step on a Branch that the History goes on from in more than one way:
 * more than one entry follows it, or the Branch ends there while others go
 * on. Every entry that follows it, oldest first.
 */
export const Split = Schema.Struct({
  at: Step,
  next: Schema.Array(Entry),
});
export type Split = typeof Split.Type;

export const History = Schema.Struct({
  /** The Branch asked for, the Head's unless said, oldest first, as narrowed. */
  entries: Schema.Array(Entry),
  /** Where the Branch asked for goes on in more than one way, oldest first; never narrowed. */
  splits: Schema.Array(Split),
  /** The last entry of every Branch, oldest first. */
  tips: Schema.Array(Schema.Number),
  head: Schema.NullOr(Schema.Number),
  size: Schema.Number,
  seeking: Schema.NullOr(Step),
  running: Schema.Boolean,
  failure: Schema.NullOr(Schema.String),
});
export type History = typeof History.Type;

export const SnapshotView = Schema.Struct({
  at: Step,
  /** The dot path read, `''` for the whole Snapshot. */
  path: Schema.String,
  value: Schema.Unknown,
  /** Whether deep parts were folded to a count, as the value was large. */
  summarized: Schema.Boolean,
});
export type SnapshotView = typeof SnapshotView.Type;

/** A path's value before and after; absent on the side it was not there. */
export const ValueChange = Schema.Struct({
  path: Schema.String,
  from: Schema.optionalKey(Schema.Unknown),
  to: Schema.optionalKey(Schema.Unknown),
});

/** One line of a unified diff, or a run of unchanged lines folded to a count. */
export const DiffRow = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals(['same', 'removed', 'added']),
    text: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal('skip'), count: Schema.Number }),
]);

export const ChangeKind = Schema.Literals(['added', 'removed', 'changed']);

/**
 * What a Step did to one Instance, as the Snapshots before and after it
 * say: started by it, changed by it, or gone after it; values encoded.
 */
export const InstanceChange = Schema.Struct({
  /** Its Address. */
  instance: Schema.String,
  kind: ChangeKind,
  actor: Schema.String,
  state: Schema.optionalKey(Schema.Tuple([Schema.String, Schema.String])),
  /** Each Model path that changed, `·` for the whole of it. */
  model: Schema.Array(ValueChange),
  props: Schema.Array(ValueChange),
  /** The Workers its data asks for after the Step and not before, `name` or `name#key`. */
  started: Schema.Array(Schema.String),
  /** The Workers its data asks for before the Step and not after. */
  stopped: Schema.Array(Schema.String),
  /** Its Model and Props before and after, as unified diffs; for a changed Instance. */
  diff: Schema.optionalKey(
    Schema.Struct({
      model: Schema.Array(DiffRow),
      props: Schema.Array(DiffRow),
    }),
  ),
});
export type InstanceChange = typeof InstanceChange.Type;

export const Changes = Schema.Struct({
  entry: Entry,
  /** The Commands its Update asked for, by name. */
  commands: Schema.Array(Schema.String),
  changes: Schema.Array(InstanceChange),
});
export type Changes = typeof Changes.Type;

export const Condition = Schema.Literals(['always', 'while', 'each']);

/** One level of a Blueprint: the top, or one State's block. */
export const Level = Schema.Struct({
  /** The Messages it has an Update for. */
  on: Schema.Array(Schema.String),
  workers: Schema.Array(
    Schema.Struct({ name: Schema.String, condition: Condition }),
  ),
  children: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      /** The Child's Actor, by name. */
      actor: Schema.String,
      condition: Condition,
      keyed: Schema.Boolean,
    }),
  ),
  /** The Queries it answers: what each is asked with, if anything, and what it answers. */
  queries: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      args: Schema.optionalKey(Schema.suspend(() => Shape)),
      result: Schema.suspend(() => Shape),
    }),
  ),
  /** The Capabilities it Provides to everything below it, by name. */
  provides: Schema.Array(Schema.String),
});

/** What an Actor is, as Kabuki's Blueprint says, with nothing running. */
export const Blueprint = Schema.Struct({
  name: Schema.String,
  /** Whether it has no States of its own: its one State is `Single`. */
  single: Schema.Boolean,
  /** The Capabilities its own code may use, by name. */
  requires: Schema.Array(Schema.String),
  top: Level,
  /** Each State's level, by tag: every State it can be in, in order. */
  state: Schema.Record(Schema.String, Level),
});

export const WorkerNow = Schema.Struct({
  name: Schema.String,
  /** The keys it runs for at the Step; `''` alone for one that is not `each`. */
  keys: Schema.Array(Schema.String),
});

/**
 * What the app was seen to do with an Actor, along the Head's Branch:
 * which Message took it from which State to which, read from the
 * Snapshots before and after each entry.
 */
export const Known = Schema.Struct({
  moves: Schema.Array(
    Schema.Struct({
      from: Schema.String,
      message: Schema.String,
      to: Schema.String,
      count: Schema.Number,
    }),
  ),
});

/** One card on the canvas: an Instance at the Step, with its Blueprint and what is known of it. */
export interface GraphNode {
  /** Its Address; in the Blueprint, its place. */
  readonly id: string;
  /** Its slot in its parent, with its key; the Actor's name at the root. */
  readonly title: string;
  readonly actor: string;
  readonly blueprint: typeof Blueprint.Type;
  /** When it exists in its parent: null for the root. */
  readonly condition: typeof Condition.Type | null;
  readonly keyed: boolean;
  /** Its parent's State it lives in, when not the parent's top. */
  readonly within: string | null;
  readonly state: string | null;
  readonly key?: string;
  /** Its Workers and the keys each runs for: known only at the Head of a Live app, else none. */
  readonly workers: ReadonlyArray<typeof WorkerNow.Type>;
  /** What the Step did to it: paths only; `node` has the values. */
  readonly change?: {
    readonly kind: typeof ChangeKind.Type;
    readonly state?: readonly [string, string];
    readonly model: ReadonlyArray<string>;
    readonly props: ReadonlyArray<string>;
    /** Workers it started and stopped, `name` or `name#key`. */
    readonly started: ReadonlyArray<string>;
    readonly stopped: ReadonlyArray<string>;
  };
  readonly known?: typeof Known.Type;
  /** Its Children the Step stopped, by slot. */
  readonly gone: ReadonlyArray<{ readonly slot: string; readonly id: string }>;
  /** The Message the Step was for it, and the Commands that asked. */
  readonly took?: {
    readonly message: string;
    readonly commands: ReadonlyArray<string>;
    readonly outcome: typeof Outcome.Type;
  };
  readonly children: ReadonlyArray<GraphNode>;
}

export const GraphNode: Schema.Codec<GraphNode> = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  actor: Schema.String,
  blueprint: Blueprint,
  condition: Schema.NullOr(Condition),
  keyed: Schema.Boolean,
  within: Schema.NullOr(Schema.String),
  state: Schema.NullOr(Schema.String),
  key: Schema.optionalKey(Schema.String),
  workers: Schema.Array(WorkerNow),
  change: Schema.optionalKey(
    Schema.Struct({
      kind: ChangeKind,
      state: Schema.optionalKey(Schema.Tuple([Schema.String, Schema.String])),
      model: Schema.Array(Schema.String),
      props: Schema.Array(Schema.String),
      started: Schema.Array(Schema.String),
      stopped: Schema.Array(Schema.String),
    }),
  ),
  known: Schema.optionalKey(Known),
  gone: Schema.Array(Schema.Struct({ slot: Schema.String, id: Schema.String })),
  took: Schema.optionalKey(
    Schema.Struct({
      message: Schema.String,
      commands: Schema.Array(Schema.String),
      outcome: Outcome,
    }),
  ),
  children: Schema.Array(Schema.suspend(() => GraphNode)),
});

export const Graph = Schema.Struct({ at: Step, root: GraphNode });
export type Graph = typeof Graph.Type;

/**
 * Every Actor the app's root can grow, read from the root's Blueprint, one
 * node per Child slot, each by its place, running or not: no Instance, Step
 * or change in it. Each level's Provides are declared, so they are there.
 */
export const Blueprinted = Schema.Struct({ root: GraphNode });
export type Blueprinted = typeof Blueprinted.Type;

/** A Schema as a card draws it: fields and their types. */
export type Shape =
  | { readonly kind: 'struct'; readonly fields: ReadonlyArray<Field> }
  | { readonly kind: 'array'; readonly of: Shape }
  | { readonly kind: 'record'; readonly of: Shape }
  | { readonly kind: 'union'; readonly members: ReadonlyArray<Shape> }
  | { readonly kind: 'leaf'; readonly text: string };

export interface Field {
  readonly name: string;
  readonly optional: boolean;
  readonly shape: Shape;
}

export const Shape: Schema.Codec<Shape> = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('struct'),
    fields: Schema.Array(Schema.suspend(() => Field)),
  }),
  Schema.Struct({
    kind: Schema.Literal('array'),
    of: Schema.suspend(() => Shape),
  }),
  Schema.Struct({
    kind: Schema.Literal('record'),
    of: Schema.suspend(() => Shape),
  }),
  Schema.Struct({
    kind: Schema.Literal('union'),
    members: Schema.Array(Schema.suspend(() => Shape)),
  }),
  Schema.Struct({ kind: Schema.Literal('leaf'), text: Schema.String }),
]);

export const Field: Schema.Codec<Field> = Schema.Struct({
  name: Schema.String,
  optional: Schema.Boolean,
  shape: Shape,
});

/** What a card shows for one Instance at a Step; values encoded. */
export const Node = Schema.Struct({
  /** Its Address. */
  id: Schema.String,
  actor: Schema.String,
  at: Step,
  key: Schema.optionalKey(Schema.String),
  state: Schema.Unknown,
  model: Schema.Unknown,
  props: Schema.optionalKey(Schema.Unknown),
  /** Its Workers and the keys each runs for; none unless the Step is the Head of a Live app. */
  workers: Schema.Array(WorkerNow),
  /** What its Workers are doing now; empty unless the Step is the live one. */
  status: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      key: Schema.String,
      status: Schema.Literals(['running', 'finished', 'failed']),
    }),
  ),
  /** The Capabilities it Provides at the Step, by name: at its top, and in the State it is in. */
  provides: Schema.Struct({
    top: Schema.Array(Schema.String),
    state: Schema.Array(Schema.String),
  }),
  change: Schema.optionalKey(InstanceChange),
  schemas: Schema.Struct({
    model: Schema.optionalKey(Shape),
    props: Schema.optionalKey(Shape),
    /** Each State's fields besides `_tag`, by tag. */
    states: Schema.Record(Schema.String, Schema.Array(Field)),
    /** Each Message's fields besides `_tag`, by tag. */
    messages: Schema.Record(Schema.String, Schema.Array(Field)),
  }),
});
export type Node = typeof Node.Type;

/**
 * One moment of an Instance's Trail: the History entry, `null` for init,
 * and what it did to the Instance; its State before and after when it
 * changed, and the Model and Props paths it changed.
 */
export const Moment = Schema.Struct({
  entry: Schema.NullOr(Entry),
  kind: Schema.Literals(['started', 'changed', 'received', 'stopped']),
  state: Schema.optionalKey(Schema.Tuple([Schema.String, Schema.String])),
  model: Schema.Array(Schema.String),
  props: Schema.Array(Schema.String),
});
export type Moment = typeof Moment.Type;

/** One Instance's Trail along a Branch, oldest first. */
export const Trail = Schema.Struct({
  instance: Schema.String,
  /** Its Actor, by name. */
  actor: Schema.String,
  moments: Schema.Array(Moment),
});
export type Trail = typeof Trail.Type;

// 2. Errors
export class StepNotFound extends Schema.TaggedError<StepNotFound>()(
  'StepNotFound',
  {
    step: Step,
    /** The oldest and newest entries the Head's Branch keeps. */
    oldest: Schema.NullOr(Schema.Number),
    newest: Schema.NullOr(Schema.Number),
  },
) {}

export class PathNotFound extends Schema.TaggedError<PathNotFound>()(
  'PathNotFound',
  {
    path: Schema.String,
    /** The longest part of the path that is there. */
    found: Schema.String,
    /** The keys there are at `found`. */
    available: Schema.Array(Schema.String),
  },
) {}

export class InstanceNotFound extends Schema.TaggedError<InstanceNotFound>()(
  'InstanceNotFound',
  {
    instance: Schema.String,
    at: Step,
    /** Every Instance at the Step, by Address. */
    available: Schema.Array(Schema.String),
  },
) {}

// 3. Methods
/** Absent: the Head, as the app is now. */
const at = Schema.optionalKey(Step);

/** An entry on the Branch meant: the Head's, if it passes through it, else the newest that does. Absent: the Head's. */
const branch = Schema.optionalKey(Schema.Number);

export const KabukiSessionApi = RpcGroup.make(
  /** Who the Kabuki Session is. */
  Rpc.make('info', { success: Info }),
  /** DevTools gives the Kabuki Session its final name; the app keeps it for this tab. */
  Rpc.make('named', { payload: { name: Schema.String } }),
  /** A Branch, the Head's unless said: the `last` few entries, or those after `since`. */
  Rpc.make('history', {
    payload: {
      last: Schema.optionalKey(Schema.Number),
      since: Schema.optionalKey(Schema.Number),
      branch,
    },
    success: History,
    error: StepNotFound,
  }),
  /** Where the app is now, then again after every change: History, Head, Step Seeked, Workers. */
  Rpc.make('watch', { success: Now, stream: true }),
  /** The page the app runs in now, then again each time it moves to another. */
  Rpc.make('page', { success: Schema.String, stream: true }),
  /** The Snapshot at a Step, or a part of it by dot path; folded when large, unless `expand`. */
  Rpc.make('snapshot', {
    payload: {
      at,
      path: Schema.optionalKey(Schema.String),
      expand: Schema.optionalKey(Schema.Boolean),
    },
    success: SnapshotView,
    error: Schema.Union([StepNotFound, PathNotFound]),
  }),
  /** What one Step added, changed and removed. */
  Rpc.make('changes', {
    payload: { step: Schema.Number },
    success: Changes,
    error: StepNotFound,
  }),
  /** What the canvas draws at a Step: every Instance, its Blueprint, and what is known. No layout. */
  Rpc.make('graph', {
    payload: { at },
    success: Graph,
    error: StepNotFound,
  }),
  /** Every Actor the app's root can grow, from its Blueprint, whether it runs or not. */
  Rpc.make('blueprint', { success: Blueprinted }),
  /** What a card shows for one Instance, by Address, at a Step. */
  Rpc.make('node', {
    payload: { instance: Schema.String, at },
    success: Node,
    error: Schema.Union([StepNotFound, InstanceNotFound]),
  }),
  /** One Instance's Trail, by Address, along a Branch, the Head's unless said: when it started, each entry Sent to it or that changed it, and when it stopped. */
  Rpc.make('trail', {
    payload: { instance: Schema.String, branch },
    success: Trail,
    error: Schema.Union([StepNotFound, InstanceNotFound]),
  }),
  /** Seek a Step in the app itself, init included, on any Branch, Time Travelling it there; `null` draws its Head again. */
  Rpc.make('seek', {
    payload: { step: Schema.NullOr(Step) },
    error: StepNotFound,
  }),
  /** Fork the app to an entry (`null`: init): its Head moves there, and the next Message grows a new Branch. */
  Rpc.make('fork', {
    payload: { from: Schema.NullOr(Schema.Number) },
    error: StepNotFound,
  }),
);

/** An Api client for one Kabuki Session: in memory in the page, or remote through DevTools. */
export type KabukiSessionClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof KabukiSessionApi>,
  RpcClientError.RpcClientError
>;

// 4. Wire
/** Where on the DevTools Server a Kabuki Session dials. */
export const CONNECT_PATH = '/kabuki/connect';

/** What a Kabuki Session dials with, as the query of `CONNECT_PATH`. */
export interface Dialed {
  /** The name it asks for. */
  readonly name: string;
  /** Its page. */
  readonly url: string;
  /** Its app. */
  readonly app: string;
  /** Where it runs: the one it was given, else the page's host, else `DEFAULT_ENVIRONMENT`. */
  readonly environment: string;
}

/** The Environment of a Kabuki Session given none and running on no page, as outside a browser. */
export const DEFAULT_ENVIRONMENT = 'default';

/** What both ends of the socket speak: one JSON message per frame. */
export const serialization = RpcSerialization.layerJson;
