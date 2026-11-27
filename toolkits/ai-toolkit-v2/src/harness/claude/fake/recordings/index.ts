import type {
  CanUseTool,
  McpServerStatus,
  SDKControlGetContextUsageResponse,
  SDKControlInitializeResponse,
  SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import answersJson from './answers.json' with { type: 'json' };
import cancel from './cancel.json' with { type: 'json' };
import create from './create.json' with { type: 'json' };
import fork from './fork.json' with { type: 'json' };
import permission from './permission.json' with { type: 'json' };
import question from './question.json' with { type: 'json' };
import send from './send.json' with { type: 'json' };
import steer from './steer.json' with { type: 'json' };
import structured from './structured.json' with { type: 'json' };

export type RecordingEntry =
  | { readonly message: SDKMessage }
  | {
      readonly request: {
        readonly toolName: string;
        readonly input: Record<string, unknown>;
        readonly options: Omit<Parameters<CanUseTool>[2], 'signal'>;
      };
    }
  | { readonly exit: string };

export interface Recording {
  readonly name: string;
  readonly entries: ReadonlyArray<RecordingEntry>;
}

export interface Answers {
  readonly initialization: SDKControlInitializeResponse;
  readonly contextUsage: SDKControlGetContextUsageResponse;
  readonly mcpServerStatus: ReadonlyArray<McpServerStatus>;
}

const recordingOf = (json: object): Recording => json as Recording;

const answersOf = (json: object): Answers => json as Answers;

export const recordings: ReadonlyArray<Recording> = [
  create,
  send,
  fork,
  steer,
  permission,
  question,
  cancel,
  structured,
].map(recordingOf);

export const answers: Answers = answersOf(answersJson);
