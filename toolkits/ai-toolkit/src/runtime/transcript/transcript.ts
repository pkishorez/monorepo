import { Effect, Queue } from 'effect';
import type { StdTableService } from 'std-toolkit/db';
import { FLUSH_MIN_CHARS } from '../constants.js';
import type {
  AiCustomPart,
  AiMessagePart,
  TranscriptWriter,
} from '../protocol/index.js';
import { messages, type MessageRole } from '../table/index.js';

type Table = StdTableService<'ai-toolkit'>;

interface Entry {
  readonly role: MessageRole;
  part: AiMessagePart;
}

type TranscriptEvent =
  | {
      readonly type: 'delta';
      readonly partType: 'text' | 'thinking';
      readonly delta: string;
    }
  | { readonly type: 'boundary'; readonly entry: Entry }
  | { readonly type: 'close' };

export interface TranscriptTarget {
  readonly threadId: string;
  readonly runId: string;
}

export interface Transcript {
  readonly writer: TranscriptWriter;
  /** Persists batches until `close` runs, then flushes what remains. */
  readonly drain: Effect.Effect<void, TranscriptFailed, Table>;
  readonly close: Effect.Effect<void>;
}

export class TranscriptFailed extends Error {
  override readonly name = 'TranscriptFailed';
}

const isStreamingText = (
  entry: Entry | undefined,
  type: 'text' | 'thinking',
): entry is Entry & { part: { type: typeof type; content: string } } =>
  entry !== undefined &&
  entry.role === 'assistant' &&
  entry.part.type === type &&
  'content' in entry.part;

const pad = (sequence: number): string => String(sequence).padStart(6, '0');

export const makeTranscript = (
  target: TranscriptTarget,
): Effect.Effect<Transcript> =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<TranscriptEvent>();
    const offer = (event: TranscriptEvent): void => {
      Queue.offerUnsafe(events, event);
    };
    const boundary = (role: MessageRole, part: AiMessagePart): void => {
      offer({ type: 'boundary', entry: { role, part } });
    };
    const delta = (partType: 'text' | 'thinking', value: string): void => {
      if (value.length > 0) offer({ type: 'delta', partType, delta: value });
    };

    const writer: TranscriptWriter = {
      text: (value) => delta('text', value),
      thinking: (value) => delta('thinking', value),
      thinkingPart: (part) =>
        boundary('assistant', { type: 'thinking', ...part }),
      toolCall: (part) => boundary('assistant', { type: 'tool-call', ...part }),
      toolResult: (part) =>
        boundary('assistant', { type: 'tool-result', ...part }),
      part: (part: AiCustomPart) => boundary('assistant', part),
      resolution: (part: AiCustomPart) => boundary('user', part),
    };

    const drain = Effect.gen(function* () {
      let buffer: Entry[] = [];
      let streamingChars = 0;
      let sequence = 0;
      let lastCreatedAt = 0;

      const nextCreatedAt = (): number => {
        lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1);
        return lastCreatedAt;
      };

      const persist = Effect.gen(function* () {
        if (buffer.length === 0) return;
        const pending = buffer;
        buffer = [];
        streamingChars = 0;
        const groups: Array<{ role: MessageRole; parts: AiMessagePart[] }> = [];
        for (const entry of pending) {
          const last = groups.at(-1);
          if (last !== undefined && last.role === entry.role) {
            last.parts.push(entry.part);
          } else {
            groups.push({ role: entry.role, parts: [entry.part] });
          }
        }
        for (const group of groups) {
          sequence += 1;
          yield* messages
            .insert({
              id: `${target.runId}:${pad(sequence)}`,
              threadId: target.threadId,
              runId: target.runId,
              role: group.role,
              createdAt: nextCreatedAt(),
              data: { parts: group.parts, metadata: null },
            })
            .pipe(
              Effect.mapError(
                (error) =>
                  new TranscriptFailed(error.message, { cause: error }),
              ),
            );
        }
      });

      while (true) {
        const event = yield* Queue.take(events);
        if (event.type === 'close') {
          yield* persist;
          return;
        }
        if (event.type === 'boundary') {
          buffer.push(event.entry);
          yield* persist;
          continue;
        }

        const last = buffer.at(-1);
        if (isStreamingText(last, event.partType)) {
          last.part = {
            ...last.part,
            content: last.part.content + event.delta,
          };
        } else {
          buffer.push({
            role: 'assistant',
            part: { type: event.partType, content: event.delta },
          });
        }
        streamingChars += event.delta.length;
        if (streamingChars >= FLUSH_MIN_CHARS) yield* persist;
      }
    });

    const close = Effect.sync(() => offer({ type: 'close' }));

    return { writer, drain, close };
  });

export type RecordedWrite =
  | { readonly method: 'text' | 'thinking'; readonly delta: string }
  | {
      readonly method:
        | 'toolCall'
        | 'toolResult'
        | 'thinkingPart'
        | 'resolution';
      readonly part: unknown;
    }
  | {
      readonly method: 'part';
      readonly part: unknown;
    };

/** A TranscriptWriter that records every call, for translator tests. */
export const recordingTranscript = () => {
  const writes: RecordedWrite[] = [];
  const writer: TranscriptWriter = {
    text: (delta) => void writes.push({ method: 'text', delta }),
    thinking: (delta) => void writes.push({ method: 'thinking', delta }),
    thinkingPart: (part) => void writes.push({ method: 'thinkingPart', part }),
    toolCall: (part) => void writes.push({ method: 'toolCall', part }),
    toolResult: (part) => void writes.push({ method: 'toolResult', part }),
    part: (part) => void writes.push({ method: 'part', part }),
    resolution: (part) => void writes.push({ method: 'resolution', part }),
  };
  return { writer, writes } as const;
};
