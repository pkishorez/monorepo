import type { Message, Part, Usage } from '@kestack/ai-toolkit/api';

/*
 * A session's Messages as rows to draw, one agent at a time. A Message is
 * one record as it arrived, so the pairing happens here:
 *
 * - a toolCall is running until a toolResult with its id arrives; with no
 *   result once its turn has ended, it was stopped. A failed result that
 *   came after the agent's last word in a cancelled turn is the agent
 *   reporting the interrupt (Claude does), so it was stopped too;
 * - a toolCall to a subagent holds the Messages whose `agentId` is its id,
 *   drawn the same way, so subagents nest;
 * - a turn's usage is its turnEnded's, or else the sum of its usage parts,
 *   which are never rows of their own.
 */

type Of<T extends Part['type']> = Extract<Part, { readonly type: T }>;

export type ToolState = 'running' | 'done' | 'failed' | 'stopped';

export type Row =
  | {
      readonly kind: 'turn';
      readonly id: string;
      readonly text: string;
      readonly steered: boolean;
    }
  /** A user's words inside a subagent: the prompt it was given. */
  | { readonly kind: 'prompt'; readonly id: string; readonly text: string }
  | { readonly kind: 'text'; readonly id: string; readonly text: string }
  | { readonly kind: 'reasoning'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'tool';
      readonly id: string;
      readonly call: Of<'toolCall'>;
      readonly result: Of<'toolResult'> | null;
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
      readonly status: Of<'turnEnded'>['status'];
      readonly usage: Usage | null;
      readonly error: string | null;
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

/** Every row of the main agent, oldest first, each subagent nested in its call. */
export const thread = (
  messages: ReadonlyArray<Message>,
): ReadonlyArray<Row> => {
  const sorted = [...messages].sort((a, b) => a.id.localeCompare(b.id));
  const results = new Map<string, Of<'toolResult'>>();
  const resultAt = new Map<string, string>();
  const byAgent = new Map<string | null, Message[]>();
  const ended = new Set<string>();
  const cancelled = new Set<string>();
  const lastWord = new Map<string, string>();
  const summed = new Map<string, Usage>();
  for (const message of sorted) {
    const list = byAgent.get(message.agentId) ?? [];
    list.push(message);
    byAgent.set(message.agentId, list);
    if (message.role === 'assistant') lastWord.set(message.turnId, message.id);
    for (const part of message.parts) {
      if (part.type === 'toolResult') {
        results.set(part.toolCallId, part);
        resultAt.set(part.toolCallId, message.id);
      } else if (part.type === 'turnEnded') {
        ended.add(message.turnId);
        if (part.status === 'cancelled') cancelled.add(message.turnId);
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

  const rowsOf = (agentId: string | null, seen: Set<string>): Row[] =>
    (byAgent.get(agentId) ?? []).flatMap((message) =>
      message.parts.flatMap((part, at): Row[] => {
        const id = `${message.id}:${at}`;
        switch (part.type) {
          case 'turnStarted':
            return [
              { kind: 'turn', id, text: part.text, steered: part.steered },
            ];
          case 'text':
            return part.text.trim() === ''
              ? []
              : message.role !== 'user'
                ? [{ kind: 'text', id, text: part.text }]
                : // The main agent's own words come as turnStarted.
                  agentId === null
                  ? []
                  : [{ kind: 'prompt', id, text: part.text }];
          case 'reasoning':
            return part.text.trim() === ''
              ? []
              : [{ kind: 'reasoning', id, text: part.text }];
          case 'toolCall': {
            const result = results.get(part.id) ?? null;
            const state = stateOf(part, message.turnId);
            if (part.tool !== 'subagent' || seen.has(part.id))
              return [{ kind: 'tool', id, call: part, result, state }];
            const rows = rowsOf(part.id, new Set(seen).add(part.id));
            return [{ kind: 'subagent', id, call: part, result, state, rows }];
          }
          case 'turnEnded':
            return [
              {
                kind: 'ended',
                id,
                status: part.status,
                usage: part.usage ?? summed.get(message.turnId) ?? null,
                error: part.error ?? null,
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
          case 'usage':
            return [];
          default:
            return [
              { kind: 'note', id, label: (part as { type: string }).type },
            ];
        }
      }),
    );

  return rowsOf(null, new Set());
};
