import type { QuestionAnswer } from '../../contract/index.js';
import type { TurnEndStatus } from '../../../contract/projection/index.js';
import type { ThreadItem, TurnStatus } from '../app-server/index.js';

/*
 * What Codex's Raw records are, apart from how a running thread makes them:
 * the kinds the harness writes of its own, which items are tools, how a
 * turn's status reads. Plain values and types only, so the projection
 * (../project) runs in a browser too, without the app-server's process.
 */

export type Channel = 'text' | 'reasoning';

/** The kind of the Raw record one streamed chunk is kept as. */
export const TEXT_CHUNK = 'text.chunk';

/**
 * Codex keeps no item for a question it asks, so the harness records its
 * own: one when it is asked, its params as Codex sent them, and one when it
 * is answered, declined or dropped.
 */
export const QUESTION_ASKED = 'question.asked';
export const QUESTION_ANSWERED = 'question.answered';

/** What `question.answered` holds: null answers, it got none. */
export interface QuestionAnswered {
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  /** Each question's header, by its id, so the answers read on their own. */
  readonly headers: Readonly<Record<string, string>>;
  readonly answers: QuestionAnswer | null;
}

/** Items that are something the agent does; their start is worth showing. */
const TOOL_ITEM_TYPES: ReadonlySet<string> = new Set([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'collabAgentToolCall',
  'webSearch',
  'imageView',
  'imageGeneration',
] satisfies ReadonlyArray<ThreadItem['type']>);

export type ToolItem = Extract<
  ThreadItem,
  {
    type:
      | 'commandExecution'
      | 'fileChange'
      | 'mcpToolCall'
      | 'dynamicToolCall'
      | 'collabAgentToolCall'
      | 'webSearch'
      | 'imageView'
      | 'imageGeneration';
  }
>;

export const isToolItem = (item: ThreadItem): item is ToolItem =>
  TOOL_ITEM_TYPES.has(item.type);

export const TURN_END: Record<TurnStatus, TurnEndStatus> = {
  completed: 'done',
  interrupted: 'cancelled',
  failed: 'failed',
  inProgress: 'failed',
};

/**
 * An error as a person reads it: Codex passes a provider's rejection on as
 * its JSON body (`{"type":"error","status":400,"error":{"message":…}}`).
 */
export const readableError = (message: string): string => {
  let body: unknown;
  try {
    body = JSON.parse(message);
  } catch {
    return message;
  }
  const inner = (body as { error?: { message?: unknown } } | null)?.error
    ?.message;
  return typeof inner === 'string' && inner !== '' ? inner : message;
};
