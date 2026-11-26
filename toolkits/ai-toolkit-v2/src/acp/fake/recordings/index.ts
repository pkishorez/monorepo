import type * as acp from '@agentclientprotocol/sdk/unstable';
import type { Array } from 'effect';
import antigravity from './antigravity.json' with { type: 'json' };

export type Step =
  | { readonly update: acp.SessionUpdate }
  | { readonly request: Omit<acp.RequestPermissionRequest, 'sessionId'> }
  | { readonly elicitation: acp.CreateElicitationRequest }
  | { readonly exit: true };

export interface Recording {
  readonly name: string;
  readonly initialize: acp.InitializeResponse;
  readonly session: Omit<acp.NewSessionResponse, 'sessionId'>;
  readonly steps: ReadonlyArray<Step>;
  readonly response: acp.PromptResponse;
  readonly sessions?: acp.ListSessionsResponse;
}

export const recordings =
  antigravity as unknown as Array.NonEmptyReadonlyArray<Recording>;
