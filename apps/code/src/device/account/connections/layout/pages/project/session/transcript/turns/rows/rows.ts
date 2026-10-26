import type { Message, Part, Usage } from '@kestack/connect/code';

/*
 * A session's Messages as rows to draw, one agent at a time. A Message is
 * one record as it arrived, so the pairing happens here:
 *
 * - a toolCall is running until a toolResult with its id arrives; with no
 *   result once its turn has ended, it was stopped. A failed result that
 *   came after the agent's last word in a cancelled turn is the agent
 *   reporting the interrupt (Claude does), so it was stopped too. A call
 *   that asked an Agent Question also takes the questionAnswered with its
 *   id: what the user answered;
 * - a toolCall to a subagent holds the Messages whose `agentId` is its id,
 *   drawn the same way, so subagents nest. Its prompt comes first: the
 *   subagent's own user words (Codex sends them), or else the call's
 *   `prompt` or `description` input (Claude's Agent tool). Its last words
 *   are dropped when they are its report, as Codex sends both;
 * - a turn starts with your words and files, or, when the agent began it
 *   on its own, with none, or, when Connect Resumed it after a restart,
 *   with a marker in place of the prompt it sent; it ends at a Fork Point,
 *   its turnEnded;
 * - a turn's usage is its turnEnded's, or else the sum of its usage parts,
 *   which are never rows of their own; it ran from its turnStarted to its
 *   turnEnded;
 * - streamed text and reasoning arrive as textChunks, one per Message: the
 *   chunks of one stream join, in order, into one row where the first one
 *   is. It is being written while its turn runs and its agent has said
 *   nothing since; a stopped turn keeps what it got.
 */

type Of<T extends Part['type']> = Extract<Part, { readonly type: T }>;

export type ToolState = 'running' | 'done' | 'failed' | 'stopped';

export type TurnAttachment = NonNullable<
  Of<'turnStarted'>['attachments']
>[number];

export type Row =
  | {
      readonly kind: 'turn';
      readonly id: string;
      readonly text: string;
      readonly steered: boolean;
      readonly attachments: ReadonlyArray<TurnAttachment>;
      /** Begun by the agent on its own, with no words from you. */
      readonly agentStarted: boolean;
      /** Begun by Connect, to continue a turn a restart cut off. */
      readonly resumed: boolean;
    }
  /** A user's words inside a subagent: the prompt it was given. */
  | { readonly kind: 'prompt'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'text' | 'reasoning';
      readonly id: string;
      readonly text: string;
      /** Streamed and still arriving: more of it is on its way. */
      readonly writing: boolean;
    }
  | {
      readonly kind: 'tool';
      readonly id: string;
      readonly call: Of<'toolCall'>;
      readonly result: Of<'toolResult'> | null;
      /** What the user answered, when the call asked an Agent Question. */
      readonly answered: Of<'questionAnswered'> | null;
      readonly state: ToolState;
    }
  | {
      readonly kind: 'subagent';
      readonly id: string;
      readonly call: Of<'toolCall'>;
      readonly result: Of<'toolResult'> | null;
      readonly state: ToolState;
      readonly rows: ReadonlyArray<Row>;
    }
  | {
      readonly kind: 'ended';
      readonly id: string;
      /** The Turn it ends: a Fork Point. */
      readonly turnId: string;
      readonly status: Of<'turnEnded'>['status'];
      readonly usage: Usage | null;
      readonly error: string | null;
      /** How long the turn ran, in ms, when its start is known. */
      readonly duration: number | null;
    }
  | { readonly kind: 'error'; readonly id: string; readonly message: string }
  | {
      readonly kind: 'plan';
      readonly id: string;
      readonly steps: Of<'codex.plan'>['steps'];
    }
  | { readonly kind: 'note'; readonly id: string; readonly label: string };

const add = (a: Usage, b: Usage): Usage => {
  const sum = (x?: number, y?: number) =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0);
  const optional = {
    cacheReadTokens: sum(a.cacheReadTokens, b.cacheReadTokens),
    cacheWriteTokens: sum(a.cacheWriteTokens, b.cacheWriteTokens),
    costUsd: sum(a.costUsd, b.costUsd),
  };
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    ...Object.fromEntries(
      Object.entries(optional).filter(([, value]) => value !== undefined),
    ),
  };
};

/** The prompt a subagent's call gave it, from its input. */
const promptOf = (call: Of<'toolCall'>): string | null => {
  if (typeof call.input !== 'object' || call.input === null) return null;
  const { prompt, description } = call.input as Record<string, unknown>;
  for (const text of [prompt, description])
    if (typeof text === 'string' && text.trim() !== '') return text;
  return null;
};

/** Every row of the main agent, oldest first, each subagent nested in its call. */
export const thread = (
  messages: ReadonlyArray<Message>,
): ReadonlyArray<Row> => {
  const sorted = [...messages].sort((a, b) => a.id.localeCompare(b.id));
  const results = new Map<string, Of<'toolResult'>>();
  const answered = new Map<string, Of<'questionAnswered'>>();
  const resultAt = new Map<string, string>();
  const byAgent = new Map<string | null, Message[]>();
  const ended = new Set<string>();
  const cancelled = new Set<string>();
  const lastWord = new Map<string, string>();
  const summed = new Map<string, Usage>();
  const streams = new Map<string, { text: string; last: string }>();
  const startedAt = new Map<string, number>();
  for (const message of sorted) {
    const list = byAgent.get(message.agentId) ?? [];
    list.push(message);
    byAgent.set(message.agentId, list);
    if (message.role === 'assistant') lastWord.set(message.turnId, message.id);
    for (const part of message.parts) {
      if (part.type === 'toolResult') {
        results.set(part.toolCallId, part);
        resultAt.set(part.toolCallId, message.id);
      } else if (part.type === 'questionAnswered') {
        answered.set(part.toolCallId, part);
      } else if (part.type === 'turnStarted' && !part.steered) {
        if (!startedAt.has(message.turnId))
          startedAt.set(message.turnId, message.at);
      } else if (part.type === 'turnEnded') {
        ended.add(message.turnId);
        if (part.status === 'cancelled' || part.status === 'interrupted')
          cancelled.add(message.turnId);
      } else if (part.type === 'textChunk') {
        const stream = streams.get(part.streamId);
        streams.set(part.streamId, {
          text: (stream?.text ?? '') + part.text,
          last: message.id,
        });
      } else if (part.type === 'usage') {
        const before = summed.get(message.turnId);
        summed.set(
          message.turnId,
          before ? add(before, part.usage) : part.usage,
        );
      }
    }
  }

  const stateOf = (call: Of<'toolCall'>, turnId: string): ToolState => {
    const result = results.get(call.id);
    if (result && !result.isError) return 'done';
    if (result) {
      const interrupted =
        cancelled.has(turnId) &&
        (resultAt.get(call.id) ?? '') > (lastWord.get(turnId) ?? '');
      return interrupted ? 'stopped' : 'failed';
    }
    return ended.has(turnId) ? 'stopped' : 'running';
  };

  /** Whether a stream is still arriving: its turn runs and its agent's last Message holds it. */
  const writing = (
    agentId: string | null,
    turnId: string,
    last: string,
  ): boolean => !ended.has(turnId) && byAgent.get(agentId)?.at(-1)?.id === last;

  const rowsOf = (agentId: string | null, seen: Set<string>): Row[] => {
    const drawn = new Set<string>();
    return (byAgent.get(agentId) ?? []).flatMap((message) =>
      message.parts.flatMap((part, at): Row[] => {
        const id = `${message.id}:${at}`;
        switch (part.type) {
          case 'turnStarted':
            return [
              {
                kind: 'turn',
                id,
                text: part.text,
                steered: part.steered,
                attachments: part.attachments ?? [],
                agentStarted: part.agentStarted ?? false,
                resumed: part.resumed ?? false,
              },
            ];
          case 'text':
            return part.text.trim() === ''
              ? []
              : message.role !== 'user'
                ? [{ kind: 'text', id, text: part.text, writing: false }]
                : // The main agent's own words come as turnStarted.
                  agentId === null
                  ? []
                  : [{ kind: 'prompt', id, text: part.text }];
          case 'reasoning':
            return part.text.trim() === ''
              ? []
              : [{ kind: 'reasoning', id, text: part.text, writing: false }];
          case 'textChunk': {
            const stream = streams.get(part.streamId);
            if (drawn.has(part.streamId) || !stream) return [];
            drawn.add(part.streamId);
            return stream.text.trim() === ''
              ? []
              : [
                  {
                    kind: part.channel,
                    id,
                    text: stream.text,
                    writing: writing(agentId, message.turnId, stream.last),
                  },
                ];
          }
          case 'toolCall': {
            const result = results.get(part.id) ?? null;
            const state = stateOf(part, message.turnId);
            if (part.tool !== 'subagent' || seen.has(part.id))
              return [
                {
                  kind: 'tool',
                  id,
                  call: part,
                  result,
                  answered: answered.get(part.id) ?? null,
                  state,
                },
              ];
            const all = rowsOf(part.id, new Set(seen).add(part.id));
            const last = all.at(-1);
            const own =
              last?.kind === 'text' &&
              result !== null &&
              last.text.trim() === result.output.trim()
                ? all.slice(0, -1)
                : all;
            const prompt = promptOf(part);
            const rows: Row[] =
              prompt === null || own.some((row) => row.kind === 'prompt')
                ? own
                : [
                    { kind: 'prompt', id: `${id}:prompt`, text: prompt },
                    ...own,
                  ];
            return [{ kind: 'subagent', id, call: part, result, state, rows }];
          }
          case 'turnEnded':
            return [
              {
                kind: 'ended',
                id,
                turnId: message.turnId,
                status: part.status,
                usage: part.usage ?? summed.get(message.turnId) ?? null,
                error: part.error ?? null,
                duration: startedAt.has(message.turnId)
                  ? message.at - startedAt.get(message.turnId)!
                  : null,
              },
            ];
          case 'error':
            return [{ kind: 'error', id, message: part.message }];
          case 'codex.plan':
            return [{ kind: 'plan', id, steps: part.steps }];
          case 'claude.compaction':
            return [{ kind: 'note', id, label: 'Context compacted' }];
          case 'other':
            return [{ kind: 'note', id, label: part.label }];
          case 'toolResult':
          case 'questionAnswered':
          case 'usage':
            return [];
          default:
            return [
              { kind: 'note', id, label: (part as { type: string }).type },
            ];
        }
      }),
    );
  };

  return rowsOf(null, new Set());
};
