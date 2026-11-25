import { Context } from 'effect';
import type { Effect, Stream } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type {
  Blueprinted,
  ControlAsked,
  ControlRefused,
  FakeNow,
  ForkAsked,
  InstanceNotFound,
  Look,
  LookAsked,
  MessageRefused,
  Seeking,
  SendAsked,
  Sent,
  StepNotFound,
  TravelAsked,
  Watched,
} from '../../../server/rpc/session/contract/index.ts';

export type Unreachable = RpcClientError.RpcClientError;

export interface KabukiSessionCalls {
  readonly blueprint: () => Effect.Effect<Blueprinted, Unreachable>;
  readonly watch: () => Stream.Stream<Watched, Unreachable>;
  readonly look: (
    asked: LookAsked,
  ) => Effect.Effect<Look, StepNotFound | InstanceNotFound | Unreachable>;
  readonly travel: (
    asked: TravelAsked,
  ) => Effect.Effect<void, StepNotFound | Unreachable>;
  readonly fork: (
    asked: ForkAsked,
  ) => Effect.Effect<void, StepNotFound | Unreachable>;
  readonly send: (
    asked: SendAsked,
  ) => Effect.Effect<
    Sent,
    InstanceNotFound | MessageRefused | Seeking | Unreachable
  >;
  readonly fakes: () => Stream.Stream<ReadonlyArray<FakeNow>, Unreachable>;
  readonly control: (
    asked: ControlAsked,
  ) => Effect.Effect<'done', ControlRefused | Unreachable>;
}

export class KabukiSession extends Context.Service<
  KabukiSession,
  KabukiSessionCalls
>()('Inspector/service/KabukiSession') {}

export type {
  BlueprintNode,
  Blueprinted,
  Change,
  Condition,
  ControlAsked,
  ControlRefused,
  Entry,
  FakeNow,
  Field,
  ForkAsked,
  From,
  InstanceNotFound,
  Level,
  Look,
  LookAsked,
  Looked,
  MessageRefused,
  Now,
  Opened,
  Outcome,
  Seeking,
  SendAsked,
  Sent,
  Shape,
  StateLevel,
  Step,
  StepNotFound,
  TravelAsked,
  Watched,
  Worker,
} from '../../../server/rpc/session/contract/index.ts';
