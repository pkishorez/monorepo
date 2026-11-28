import type {
  AvailableCommand,
  CreateElicitationRequest,
  InitializeResponse,
  ListSessionsResponse,
  NewSessionResponse,
  PromptResponse,
  RequestPermissionRequest,
  SessionUpdate,
} from '@agentclientprotocol/sdk/unstable';
import type { Result } from '../../contract/index.ts';
import agentJson from './agent.json' with { type: 'json' };
import cancel from './cancel.json' with { type: 'json' };
import create from './create.json' with { type: 'json' };
import permission from './permission.json' with { type: 'json' };
import question from './question.json' with { type: 'json' };
import resumed from './resumed.json' with { type: 'json' };
import send from './send.json' with { type: 'json' };
import steer from './steer.json' with { type: 'json' };
import steered from './steered.json' with { type: 'json' };

export const agent = agentJson as unknown as Agent;

export const recordings = {
  create,
  send,
  resumed,
  permission,
  steer,
  steered,
  question,
  cancel,
} as unknown as Readonly<Record<string, Recording>>;

export type Step =
  | { readonly update: SessionUpdate }
  | { readonly permission: RequestPermissionRequest }
  | { readonly elicitation: CreateElicitationRequest }
  | { readonly exit: true };
export interface Recording {
  readonly steps: ReadonlyArray<Step>;
  readonly response: PromptResponse;
  readonly after?: ReadonlyArray<SessionUpdate>;
}
export interface Agent {
  readonly initialize: InitializeResponse;
  readonly session: Omit<NewSessionResponse, 'sessionId'>;
  readonly commands: Array<AvailableCommand>;
  readonly sessions: ListSessionsResponse;
  readonly print: Result;
}
