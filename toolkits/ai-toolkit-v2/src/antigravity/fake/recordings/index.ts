import type * as acp from '@agentclientprotocol/sdk/unstable';
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

export type Step =
  | { readonly update: acp.SessionUpdate }
  | { readonly permission: acp.RequestPermissionRequest }
  | { readonly elicitation: acp.CreateElicitationRequest }
  | { readonly exit: true };

export interface Recording {
  readonly steps: ReadonlyArray<Step>;
  readonly response: acp.PromptResponse;
  readonly after?: ReadonlyArray<acp.SessionUpdate>;
}

export interface Agent {
  readonly initialize: acp.InitializeResponse;
  readonly session: Omit<acp.NewSessionResponse, 'sessionId'>;
  readonly commands: Array<acp.AvailableCommand>;
  readonly sessions: acp.ListSessionsResponse;
  readonly print: Result;
}

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
