import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

export const Step = Schema.Union([Schema.Number, Schema.Literal('start')]);
export type Step = typeof Step.Type;

export const Outcome = Schema.Literals(['handled', 'ignored', 'dropped']);
export type Outcome = typeof Outcome.Type;

export const Sent = Schema.Literals([
  'handled',
  'ignored',
  'queued',
  'refused',
]);
export type Sent = typeof Sent.Type;

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
]);
export type From = typeof From.Type;

export type Shape =
  | { readonly kind: 'text' }
  | { readonly kind: 'number' }
  | { readonly kind: 'boolean' }
  | {
      readonly kind: 'choice';
      readonly options: ReadonlyArray<string | number | boolean>;
    }
  | { readonly kind: 'struct'; readonly fields: ReadonlyArray<Field> }
  | { readonly kind: 'array'; readonly of: Shape }
  | { readonly kind: 'json'; readonly text: string };

export interface Field {
  readonly name: string;
  readonly optional: boolean;
  readonly nullable: boolean;
  readonly description?: string;
  readonly shape: Shape;
}

export const Shape: Schema.Codec<Shape> = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('text') }),
  Schema.Struct({ kind: Schema.Literal('number') }),
  Schema.Struct({ kind: Schema.Literal('boolean') }),
  Schema.Struct({
    kind: Schema.Literal('choice'),
    options: Schema.Array(
      Schema.Union([Schema.String, Schema.Number, Schema.Boolean]),
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal('struct'),
    fields: Schema.Array(Schema.suspend(() => Field)),
  }),
  Schema.Struct({
    kind: Schema.Literal('array'),
    of: Schema.suspend(() => Shape),
  }),
  Schema.Struct({ kind: Schema.Literal('json'), text: Schema.String }),
]);

export const Field: Schema.Codec<Field> = Schema.Struct({
  name: Schema.String,
  optional: Schema.Boolean,
  nullable: Schema.Boolean,
  description: Schema.optionalKey(Schema.String),
  shape: Shape,
});

export const Wanted = Schema.Struct({
  name: Schema.String,
  key: Schema.optionalKey(Schema.String),
});
export type Wanted = typeof Wanted.Type;

export const BeforeAfter = Schema.Struct({
  before: Schema.optionalKey(Schema.Unknown),
  after: Schema.optionalKey(Schema.Unknown),
});
export type BeforeAfter = typeof BeforeAfter.Type;

const Placed = {
  address: Schema.String,
  actor: Schema.String,
  key: Schema.optionalKey(Schema.String),
};

const Whole = {
  ...Placed,
  state: Schema.Unknown,
  model: Schema.Unknown,
  props: Schema.optionalKey(Schema.Unknown),
  workers: Schema.Array(Wanted),
};

export const Change = Schema.Union([
  Schema.TaggedStruct('Added', Whole),
  Schema.TaggedStruct('Removed', Whole),
  Schema.TaggedStruct('Changed', {
    ...Placed,
    state: Schema.optionalKey(
      Schema.Struct({ ...BeforeAfter.fields, transition: Schema.Boolean }),
    ),
    model: Schema.Record(Schema.String, BeforeAfter),
    props: Schema.Record(Schema.String, BeforeAfter),
    workers: Schema.Struct({
      started: Schema.Array(Wanted),
      stopped: Schema.Array(Wanted),
    }),
  }),
]);
export type Change = typeof Change.Type;

export const Entry = Schema.Struct({
  id: Schema.Number,
  parent: Schema.NullOr(Schema.Number),
  to: Schema.String,
  tag: Schema.String,
  from: From,
  at: Schema.Number,
  outcome: Outcome,
  changed: Schema.Boolean,
});
export type Entry = typeof Entry.Type;

export const Now = Schema.Struct({
  head: Schema.NullOr(Schema.Number),
  previewing: Schema.NullOr(Step),
  running: Schema.Boolean,
  failure: Schema.NullOr(Schema.String),
  url: Schema.String,
  revision: Schema.Number,
});
export type Now = typeof Now.Type;

export const Cursor = Schema.Struct({
  epoch: Schema.String,
  after: Schema.NullOr(Schema.Number),
});
export type Cursor = typeof Cursor.Type;

export const HistoryAsked = Schema.Struct({ from: Schema.optionalKey(Cursor) });
export type HistoryAsked = typeof HistoryAsked.Type;

export const Told = Schema.Struct({
  now: Now,
  epoch: Schema.String,
  entries: Schema.Array(Entry),
  roots: Schema.Array(Schema.Number),
});
export type Told = typeof Told.Type;

export const Within = Schema.Literals(['always', 'state']);
export type Within = typeof Within.Type;

export const Named = Schema.Struct({ name: Schema.String, within: Within });
export type Named = typeof Named.Type;

export const Runs = Schema.Literals(['always', 'while', 'each']);
export type Runs = typeof Runs.Type;

export const Asked = Schema.Struct({
  name: Schema.String,
  key: Schema.optionalKey(Schema.String),
  within: Within,
  runs: Schema.optionalKey(Runs),
});
export type Asked = typeof Asked.Type;

export interface Node {
  readonly address: string;
  readonly actor: string;
  readonly slot: string | null;
  readonly key?: string;
  readonly state: string;
  readonly data: unknown;
  readonly model: unknown;
  readonly props?: unknown;
  readonly workers: ReadonlyArray<Asked>;
  readonly provides: ReadonlyArray<Named>;
  readonly children: ReadonlyArray<Node>;
}

export const Node: Schema.Codec<Node> = Schema.Struct({
  address: Schema.String,
  actor: Schema.String,
  slot: Schema.NullOr(Schema.String),
  key: Schema.optionalKey(Schema.String),
  state: Schema.String,
  data: Schema.Unknown,
  model: Schema.Unknown,
  props: Schema.optionalKey(Schema.Unknown),
  workers: Schema.Array(Asked),
  provides: Schema.Array(Named),
  children: Schema.Array(Schema.suspend(() => Node)),
});

export const Played = Schema.Struct({
  id: Schema.Number,
  to: Schema.String,
  tag: Schema.String,
  message: Schema.Unknown,
  from: From,
  at: Schema.Number,
  outcome: Outcome,
  commands: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      args: Schema.optionalKey(Schema.Unknown),
    }),
  ),
  emits: Schema.Array(
    Schema.Struct({
      tag: Schema.String,
      payload: Schema.Unknown,
      becomes: Schema.optionalKey(
        Schema.Struct({ to: Schema.String, tag: Schema.String }),
      ),
    }),
  ),
});
export type Played = typeof Played.Type;

export const Worker = Schema.Struct({
  name: Schema.String,
  key: Schema.String,
  status: Schema.Literals(['waiting', 'running', 'finished', 'failed']),
  failure: Schema.optionalKey(Schema.String),
  since: Schema.Number,
});
export type Worker = typeof Worker.Type;

export const Provided = Schema.Struct({
  state: Schema.optionalKey(Schema.String),
  status: Schema.Literals(['building', 'built', 'failed']),
  failure: Schema.optionalKey(Schema.String),
});
export type Provided = typeof Provided.Type;

export const Working = Schema.Struct({
  workers: Schema.Array(Worker),
  commands: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      args: Schema.Unknown,
      since: Schema.Number,
    }),
  ),
  provides: Schema.Array(Provided),
});
export type Working = typeof Working.Type;

export const Failed = Schema.Struct({
  address: Schema.String,
  kind: Schema.Literals(['worker', 'command', 'provides', 'layer']),
  name: Schema.String,
  key: Schema.optionalKey(Schema.String),
  failure: Schema.String,
  at: Schema.Number,
});
export type Failed = typeof Failed.Type;

export const Work = Schema.Struct({
  instances: Schema.Record(Schema.String, Working),
  layer: Schema.optionalKey(Provided),
  failures: Schema.Array(Failed),
  settled: Schema.Boolean,
});
export type Work = typeof Work.Type;

export const Stepped = Schema.Struct({
  at: Step,
  tree: Node,
  message: Schema.NullOr(Played),
  changes: Schema.Array(Change),
  work: Schema.optionalKey(Work),
});
export type Stepped = typeof Stepped.Type;

export const Takes = Schema.Struct({
  tag: Schema.String,
  description: Schema.optionalKey(Schema.String),
  payload: Shape,
  within: Within,
});
export type Takes = typeof Takes.Type;

export const Looked = Schema.Struct({
  at: Step,
  address: Schema.String,
  actor: Schema.String,
  description: Schema.optionalKey(Schema.String),
  slot: Schema.NullOr(Schema.String),
  key: Schema.optionalKey(Schema.String),
  state: Schema.String,
  states: Schema.Array(Schema.String),
  data: Schema.Unknown,
  model: Schema.Unknown,
  props: Schema.optionalKey(Schema.Unknown),
  workers: Schema.Array(
    Schema.Struct({ ...Asked.fields, live: Schema.optionalKey(Worker) }),
  ),
  provides: Schema.Array(Named),
  takes: Schema.Array(Takes),
});
export type Looked = typeof Looked.Type;

export const FakeNow = Schema.Struct({
  name: Schema.String,
  state: Shape,
  value: Schema.Unknown,
  controls: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.optionalKey(Schema.String),
      payload: Shape,
    }),
  ),
});
export type FakeNow = typeof FakeNow.Type;

export class StepNotFound extends Schema.TaggedError<StepNotFound>()(
  'StepNotFound',
  {
    step: Step,
    oldest: Schema.NullOr(Schema.Number),
    newest: Schema.NullOr(Schema.Number),
  },
) {}

export class InstanceNotFound extends Schema.TaggedError<InstanceNotFound>()(
  'InstanceNotFound',
  {
    instance: Schema.String,
    at: Step,
    available: Schema.Array(Schema.String),
  },
) {}

export class MessageRefused extends Schema.TaggedError<MessageRefused>()(
  'MessageRefused',
  { to: Schema.String, tag: Schema.String, reason: Schema.String },
) {}

export class Previewing extends Schema.TaggedError<Previewing>()('Previewing', {
  step: Step,
}) {}

export class ControlRefused extends Schema.TaggedError<ControlRefused>()(
  'ControlRefused',
  { fake: Schema.String, control: Schema.String, reason: Schema.String },
) {}

export const StepAsked = Schema.Struct({ at: Schema.optionalKey(Step) });
export type StepAsked = typeof StepAsked.Type;

export const LookAsked = Schema.Struct({
  at: Schema.optionalKey(Step),
  address: Schema.String,
});
export type LookAsked = typeof LookAsked.Type;

export const PreviewAsked = Schema.Struct({ at: Schema.NullOr(Step) });
export type PreviewAsked = typeof PreviewAsked.Type;

export const ForkAsked = Schema.Struct({ from: Step });
export type ForkAsked = typeof ForkAsked.Type;

export const SendAsked = Schema.Struct({
  to: Schema.String,
  message: Schema.Unknown,
});
export type SendAsked = typeof SendAsked.Type;

export const ControlAsked = Schema.Struct({
  fake: Schema.String,
  control: Schema.String,
  payload: Schema.Unknown,
});
export type ControlAsked = typeof ControlAsked.Type;

export const KabukiSessionRpcs = RpcGroup.make(
  Rpc.make('history', { payload: HistoryAsked, success: Told, stream: true }),
  Rpc.make('step', {
    payload: StepAsked,
    success: Stepped,
    error: StepNotFound,
  }),
  Rpc.make('look', {
    payload: LookAsked,
    success: Looked,
    error: Schema.Union([StepNotFound, InstanceNotFound]),
  }),
  Rpc.make('preview', { payload: PreviewAsked, error: StepNotFound }),
  Rpc.make('fork', { payload: ForkAsked, error: StepNotFound }),
  Rpc.make('send', {
    payload: SendAsked,
    success: Sent,
    error: Schema.Union([InstanceNotFound, MessageRefused, Previewing]),
  }),
  Rpc.make('world', { success: Schema.Array(FakeNow), stream: true }),
  Rpc.make('control', {
    payload: ControlAsked,
    success: Schema.Literal('done'),
    error: ControlRefused,
  }),
);
