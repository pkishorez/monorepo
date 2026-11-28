import { Context } from 'effect';
import type { Effect, Stream } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type {
  ControlAsked,
  ControlRefused,
  FakeNow,
  ForkAsked,
  HistoryAsked,
  InstanceNotFound,
  LookAsked,
  Looked,
  MessageRefused,
  Plan,
  PreviewAsked,
  Previewing,
  SendAsked,
  Sent,
  StepAsked,
  StepNotFound,
  Stepped,
  Told,
} from '../../../server/rpc/session/contract/index.ts';

export class KabukiSession extends Context.Service<
  KabukiSession,
  KabukiSessionCalls
>()('Inspector/service/KabukiSession') {}

export type Unreachable = RpcClientError.RpcClientError;
export interface KabukiSessionCalls {
  readonly history: (asked: HistoryAsked) => Stream.Stream<Told, Unreachable>;
  readonly step: (
    asked: StepAsked,
  ) => Effect.Effect<Stepped, StepNotFound | Unreachable>;
  readonly look: (
    asked: LookAsked,
  ) => Effect.Effect<Looked, StepNotFound | InstanceNotFound | Unreachable>;
  readonly preview: (
    asked: PreviewAsked,
  ) => Effect.Effect<void, StepNotFound | Unreachable>;
  readonly fork: (
    asked: ForkAsked,
  ) => Effect.Effect<void, StepNotFound | Unreachable>;
  readonly send: (
    asked: SendAsked,
  ) => Effect.Effect<
    Sent,
    InstanceNotFound | MessageRefused | Previewing | Unreachable
  >;
  readonly world: () => Stream.Stream<ReadonlyArray<FakeNow>, Unreachable>;
  readonly control: (
    asked: ControlAsked,
  ) => Effect.Effect<'done', ControlRefused | Unreachable>;
  readonly blueprint: () => Effect.Effect<Plan, Unreachable>;
}

export type {
  Asked,
  BeforeAfter,
  Change,
  ControlAsked,
  ControlRefused,
  Cursor,
  Entry,
  Failed,
  FakeNow,
  Field,
  ForkAsked,
  From,
  HistoryAsked,
  InstanceNotFound,
  LookAsked,
  Looked,
  MessageRefused,
  Named,
  Node,
  Now,
  Outcome,
  Plan,
  Played,
  PreviewAsked,
  Previewing,
  Provided,
  Runs,
  SendAsked,
  Sent,
  Shape,
  Slot,
  Step,
  StepAsked,
  StepNotFound,
  Stepped,
  Tagged,
  Takes,
  Told,
  Wanted,
  Within,
  Work,
  Worker,
  Working,
} from '../../../server/rpc/session/contract/index.ts';
