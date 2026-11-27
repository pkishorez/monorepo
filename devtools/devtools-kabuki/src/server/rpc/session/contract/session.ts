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

export const Entry = Schema.Struct({
  id: Schema.Number,
  parent: Schema.NullOr(Schema.Number),
  to: Schema.String,
  tag: Schema.String,
  from: From,
  at: Schema.Number,
  outcome: Outcome,
});
export type Entry = typeof Entry.Type;

export const Now = Schema.Struct({
  head: Schema.NullOr(Schema.Number),
  seeking: Schema.NullOr(Step),
  running: Schema.Boolean,
  failure: Schema.NullOr(Schema.String),
  url: Schema.String,
  revision: Schema.Number,
});
export type Now = typeof Now.Type;

export const Watched = Schema.Struct({
  now: Now,
  entries: Schema.Array(Entry),
});
export type Watched = typeof Watched.Type;

export const Condition = Schema.Literals(['always', 'while', 'each']);
export type Condition = typeof Condition.Type;

export const Level = Schema.Struct({
  messages: Schema.Array(
    Schema.Struct({
      tag: Schema.String,
      description: Schema.optionalKey(Schema.String),
      payload: Shape,
    }),
  ),
  workers: Schema.Array(
    Schema.Struct({ name: Schema.String, condition: Condition }),
  ),
  children: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      actor: Schema.String,
      condition: Condition,
      keyed: Schema.Boolean,
    }),
  ),
  queries: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      args: Schema.optionalKey(Shape),
      result: Shape,
    }),
  ),
  provides: Schema.Array(Schema.String),
});
export type Level = typeof Level.Type;

export const StateLevel = Schema.Struct({ ...Level.fields, data: Shape });
export type StateLevel = typeof StateLevel.Type;

export interface BlueprintNode {
  readonly place: string;
  readonly slot: string | null;
  readonly actor: string;
  readonly description?: string;
  readonly condition: Condition | null;
  readonly keyed: boolean;
  readonly within: string | null;
  readonly single: boolean;
  readonly requires: ReadonlyArray<string>;
  readonly model: Shape;
  readonly props?: Shape;
  readonly top: Level;
  readonly states: { readonly [tag: string]: StateLevel };
  readonly children: ReadonlyArray<BlueprintNode>;
}

export const BlueprintNode: Schema.Codec<BlueprintNode> = Schema.Struct({
  place: Schema.String,
  slot: Schema.NullOr(Schema.String),
  actor: Schema.String,
  description: Schema.optionalKey(Schema.String),
  condition: Schema.NullOr(Condition),
  keyed: Schema.Boolean,
  within: Schema.NullOr(Schema.String),
  single: Schema.Boolean,
  requires: Schema.Array(Schema.String),
  model: Shape,
  props: Schema.optionalKey(Shape),
  top: Level,
  states: Schema.Record(Schema.String, StateLevel),
  children: Schema.Array(Schema.suspend(() => BlueprintNode)),
});

export const Blueprinted = Schema.Struct({ root: BlueprintNode });
export type Blueprinted = typeof Blueprinted.Type;

export const Change = Schema.NullOr(Schema.Literals(['started', 'changed']));
export type Change = typeof Change.Type;

export interface Looked {
  readonly address: string;
  readonly place: string;
  readonly actor: string;
  readonly slot: string | null;
  readonly key?: string;
  readonly state: string;
  readonly change: Change;
  readonly children: ReadonlyArray<Looked>;
}

export const Looked: Schema.Codec<Looked> = Schema.Struct({
  address: Schema.String,
  place: Schema.String,
  actor: Schema.String,
  slot: Schema.NullOr(Schema.String),
  key: Schema.optionalKey(Schema.String),
  state: Schema.String,
  change: Change,
  children: Schema.Array(Schema.suspend(() => Looked)),
});

export const Worker = Schema.Struct({
  name: Schema.String,
  key: Schema.String,
  status: Schema.Literals(['running', 'finished', 'failed']),
});
export type Worker = typeof Worker.Type;

export const Opened = Schema.Struct({
  state: Schema.Unknown,
  model: Schema.Unknown,
  props: Schema.optionalKey(Schema.Unknown),
  folded: Schema.Boolean,
  workers: Schema.Array(Worker),
});
export type Opened = typeof Opened.Type;

export const Look = Schema.Struct({
  at: Step,
  root: Looked,
  opened: Schema.Record(Schema.String, Opened),
});
export type Look = typeof Look.Type;

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

export class Seeking extends Schema.TaggedError<Seeking>()('Seeking', {
  step: Step,
}) {}

export class ControlRefused extends Schema.TaggedError<ControlRefused>()(
  'ControlRefused',
  { fake: Schema.String, control: Schema.String, reason: Schema.String },
) {}

export const LookAsked = Schema.Struct({
  at: Schema.optionalKey(Step),
  open: Schema.Array(Schema.String),
  whole: Schema.optionalKey(Schema.Boolean),
});
export type LookAsked = typeof LookAsked.Type;

export const TravelAsked = Schema.Struct({ to: Schema.NullOr(Step) });
export type TravelAsked = typeof TravelAsked.Type;

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
  Rpc.make('blueprint', { success: Blueprinted }),
  Rpc.make('watch', { success: Watched, stream: true }),
  Rpc.make('look', {
    payload: LookAsked,
    success: Look,
    error: Schema.Union([StepNotFound, InstanceNotFound]),
  }),
  Rpc.make('travel', { payload: TravelAsked, error: StepNotFound }),
  Rpc.make('fork', { payload: ForkAsked, error: StepNotFound }),
  Rpc.make('send', {
    payload: SendAsked,
    success: Sent,
    error: Schema.Union([InstanceNotFound, MessageRefused, Seeking]),
  }),
  Rpc.make('fakes', { success: Schema.Array(FakeNow), stream: true }),
  Rpc.make('control', {
    payload: ControlAsked,
    success: Schema.Literal('done'),
    error: ControlRefused,
  }),
);
