import type {
  CreateElicitationRequest,
  InitializeResponse,
  ListSessionsResponse,
  NewSessionResponse,
  PromptResponse,
  RequestPermissionRequest,
  SessionUpdate,
} from '@agentclientprotocol/sdk/unstable';
import type { Array } from 'effect';
import antigravity from './antigravity.json' with { type: 'json' };

export const recordings =
  antigravity as unknown as Array.NonEmptyReadonlyArray<Recording>;

export type Step =
  | { readonly update: SessionUpdate }
  | { readonly request: Omit<RequestPermissionRequest, 'sessionId'> }
  | { readonly elicitation: CreateElicitationRequest }
  | { readonly exit: true };
export interface Recording {
  readonly name: string;
  readonly initialize: InitializeResponse;
  readonly session: Omit<NewSessionResponse, 'sessionId'>;
  readonly steps: ReadonlyArray<Step>;
  readonly response: PromptResponse;
  readonly sessions?: ListSessionsResponse;
}
