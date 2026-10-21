import type { Schema } from 'effect';
import {
  CHUNK_MAX_WAIT_MS,
  makeChunker,
  type Chunker,
  type RawOut,
} from '../../harness/index.js';
import {
  isNotification,
  type Notification,
  type ThreadItem,
} from './app-server/index.js';

export type Channel = 'text' | 'reasoning';

/** The kind of the Raw record one streamed chunk is kept as. */
export const TEXT_CHUNK = 'text.chunk';

/** One `text.chunk` record's payload. */
export interface TextChunk {
  readonly streamId: string;
  readonly channel: Channel;
  readonly text: string;
}

/**
 * Stands in a stored record for a string that streamed: the string is its
 * stream's chunks, joined in order.
 */
export interface StreamPointer {
  readonly $stream: string;
}

export const isStreamPointer = (value: unknown): value is StreamPointer =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 1 &&
  typeof (value as { $stream?: unknown }).$stream === 'string';

/**
 * Which string of an item a stream writes: a message's text is the item id;
 * a reasoning item's summary or content part adds its kind and index.
 */
export const streamIdOf = (
  itemId: string,
  part?: { readonly kind: 'summary' | 'content'; readonly index: number },
): string =>
  part === undefined ? itemId : `${itemId}:${part.kind}:${part.index}`;

/**
 * Pure: a stored payload with every stream pointer replaced by its stream's
 * chunks, joined. A pointer whose chunks are not given is left as it is.
 */
export const restore = (
  payload: Schema.Json,
  chunksByStreamId: Readonly<Record<string, ReadonlyArray<string>>>,
): Schema.Json => {
  const walk = (value: Schema.Json): Schema.Json => {
    if (isStreamPointer(value)) {
      const chunks = chunksByStreamId[value.$stream];
      return chunks === undefined ? value : chunks.join('');
    }
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value === 'object' && value !== null)
      return Object.fromEntries(
        Object.entries(value).map(([key, field]) => [key, walk(field)]),
      );
    return value;
  };
  return walk(payload);
};

interface Open {
  readonly chunker: Chunker;
  readonly threadId: string;
  readonly agentId: string | undefined;
  readonly channel: Channel;
  /** Everything pushed so far: sent chunks plus what waits. */
  written: string;
  lastEmit: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Turns one turn's text deltas into `text.chunk` records, a few sentences
 * at a time, and stores each finished string that streamed as a pointer to
 * its chunks, so Raw holds the text once. Text left waiting
 * CHUNK_MAX_WAIT_MS since the stream's last chunk is sent anyway; the rest
 * goes out before the item's own record, or when the turn ends.
 */
export interface Streams {
  /** Reads a delta notification; returns whether it was one. */
  readonly delta: (
    notification: Notification,
    agentId: string | undefined,
  ) => boolean;
  /**
   * Sends the rest of a finished item's streams and returns the item to
   * store: each string that streamed, as a pointer. Call before storing it.
   */
  readonly complete: (item: ThreadItem) => Schema.Json;
  /** The item to store for one already completed, as a turn's list repeats it. */
  readonly stored: (item: ThreadItem) => Schema.Json;
  /** Sends what waits in every stream of a thread; call before its turn/completed. */
  readonly endThread: (threadId: string) => void;
  /** Sends what waits in every stream; call before the turn's stream ends. */
  readonly flushAll: () => void;
  /** Stops every timer, sending nothing more. */
  readonly close: () => void;
}

const deltaOf = (
  notification: Notification,
):
  | (Omit<TextChunk, 'text'> & { threadId: string; delta: string })
  | undefined => {
  if (isNotification(notification, 'item/agentMessage/delta')) {
    const { threadId, itemId, delta } = notification.params;
    return { threadId, delta, channel: 'text', streamId: streamIdOf(itemId) };
  }
  if (isNotification(notification, 'item/reasoning/summaryTextDelta')) {
    const { threadId, itemId, delta, summaryIndex } = notification.params;
    return {
      threadId,
      delta,
      channel: 'reasoning',
      streamId: streamIdOf(itemId, { kind: 'summary', index: summaryIndex }),
    };
  }
  if (isNotification(notification, 'item/reasoning/textDelta')) {
    const { threadId, itemId, delta, contentIndex } = notification.params;
    return {
      threadId,
      delta,
      channel: 'reasoning',
      streamId: streamIdOf(itemId, { kind: 'content', index: contentIndex }),
    };
  }
  return undefined;
};

export const makeStreams = (emit: (out: RawOut) => void): Streams => {
  const open = new Map<string, Open>();
  /** Every finished stream's whole text, by streamId. */
  const done = new Map<string, string>();

  const send = (streamId: string, stream: Open, text: string) => {
    stream.lastEmit = Date.now();
    const payload = { streamId, channel: stream.channel, text };
    emit(
      stream.agentId === undefined
        ? { kind: TEXT_CHUNK, payload }
        : { kind: TEXT_CHUNK, payload, agentId: stream.agentId },
    );
  };

  const stopTimer = (stream: Open) => {
    if (stream.timer !== undefined) clearTimeout(stream.timer);
    stream.timer = undefined;
  };

  const flush = (streamId: string) => {
    const stream = open.get(streamId);
    if (stream === undefined) return undefined;
    stopTimer(stream);
    open.delete(streamId);
    const rest = stream.chunker.flush();
    if (rest !== null) send(streamId, stream, rest);
    done.set(streamId, stream.written);
    return stream;
  };

  const arm = (streamId: string, stream: Open) => {
    if (stream.timer !== undefined || !stream.chunker.pending()) return;
    const wait = Math.max(0, stream.lastEmit + CHUNK_MAX_WAIT_MS - Date.now());
    stream.timer = setTimeout(() => {
      stream.timer = undefined;
      const rest = stream.chunker.flush();
      if (rest !== null) send(streamId, stream, rest);
    }, wait);
  };

  /** A finished stream's string as stored: a pointer if its chunks are exactly it. */
  const pointTo = (streamId: string, text: string): string | StreamPointer =>
    done.get(streamId) === text ? { $stream: streamId } : text;

  /** Closes a stream at its final text, sending what it still lacks. */
  const finish = (streamId: string, text: string) => {
    const stream = flush(streamId);
    // Codex's final text normally equals the deltas; if they fell short,
    // the missing end is one more chunk. Text that never streamed, or
    // differs, stays inline.
    if (
      stream !== undefined &&
      text.length > stream.written.length &&
      text.startsWith(stream.written)
    ) {
      send(streamId, stream, text.slice(stream.written.length));
      done.set(streamId, text);
    }
    return pointTo(streamId, text);
  };

  /** An item as stored: each of its strings through `toStored`. */
  const mapItem = (
    item: ThreadItem,
    toStored: (streamId: string, text: string) => string | StreamPointer,
  ): Schema.Json => {
    const part =
      (kind: 'summary' | 'content') => (text: string, index: number) =>
        toStored(streamIdOf(item.id, { kind, index }), text);
    const stored =
      item.type === 'agentMessage'
        ? { ...item, text: toStored(streamIdOf(item.id), item.text) }
        : item.type === 'reasoning'
          ? {
              ...item,
              summary: item.summary.map(part('summary')),
              content: item.content.map(part('content')),
            }
          : item;
    return stored as unknown as Schema.Json;
  };

  return {
    delta: (notification, agentId) => {
      const delta = deltaOf(notification);
      if (delta === undefined) return false;
      const { streamId } = delta;
      let stream = open.get(streamId);
      if (stream === undefined) {
        stream = {
          chunker: makeChunker(),
          threadId: delta.threadId,
          agentId,
          channel: delta.channel,
          written: '',
          lastEmit: Date.now(),
          timer: undefined,
        };
        open.set(streamId, stream);
      }
      stream.written += delta.delta;
      const chunks = stream.chunker.push(delta.delta);
      if (chunks.length > 0) stopTimer(stream);
      for (const chunk of chunks) send(streamId, stream, chunk);
      arm(streamId, stream);
      return true;
    },
    complete: (item) => mapItem(item, finish),
    stored: (item) => mapItem(item, pointTo),
    endThread: (threadId) => {
      for (const [streamId, stream] of open)
        if (stream.threadId === threadId) flush(streamId);
    },
    flushAll: () => {
      for (const streamId of open.keys()) flush(streamId);
    },
    close: () => {
      for (const stream of open.values()) stopTimer(stream);
      open.clear();
    },
  };
};
