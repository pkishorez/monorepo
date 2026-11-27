import { Context, Data } from 'effect';
import type { Effect, Stream } from 'effect';
import type {
  JsonSchema,
  Message,
  Thread,
} from '../../../agent/server/rpc/agent/contract/index.js';

export type {
  JsonSchema,
  Message,
  RunStatus,
  Thread,
} from '../../../agent/server/rpc/agent/contract/index.js';

export class AgentProblem extends Data.TaggedError('AgentProblem')<{
  readonly message: string;
}> {}

export interface Question {
  readonly folder: string;
  readonly prompt: string;
  readonly system?: string;
  readonly schema?: JsonSchema;
  readonly mcp?: boolean;
}

export interface FollowUp {
  readonly thread: string;
  readonly prompt: string;
  readonly schema?: JsonSchema;
}

export interface AgentService {
  readonly ask: (question: Question) => Effect.Effect<string, AgentProblem>;
  readonly followUp: (followUp: FollowUp) => Effect.Effect<void, AgentProblem>;
  readonly threads: (
    folder: string,
  ) => Effect.Effect<ReadonlyArray<Thread>, AgentProblem>;
  readonly watch: (
    thread: string,
  ) => Stream.Stream<ReadonlyArray<Message>, AgentProblem>;
  readonly cancel: (thread: string) => Effect.Effect<void, AgentProblem>;
}

export class Agent extends Context.Service<Agent, AgentService>()(
  'DevTools/service/Agent',
) {}
