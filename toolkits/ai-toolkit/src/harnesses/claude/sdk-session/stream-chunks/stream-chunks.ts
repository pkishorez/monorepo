/**
 * Turns Claude Code's token stream into `text.chunk` records of a few
 * sentences each, and keeps a streamed block's text only in its chunks.
 *
 * With `includePartialMessages`, Claude Code sends every Messages API
 * streaming event as a `stream_event`, and still sends each content block
 * whole as its own `assistant` record. That whole record arrives while its
 * block is still open: after the block's last delta, before its
 * `content_block_stop`. A block's `streamId` is `<message id>:<block index>`.
 *
 * The whole record is kept with every field, except that a streamed text or
 * thinking block's string becomes a pointer to its chunks:
 * `{ type: 'text', text: { $stream: streamId } }`, or `thinking: { $stream }`
 * beside its signature. `restore` puts the strings back. A block is pointed
 * only when it has chunks and they add up to exactly its text; otherwise
 * it stays inline.
 *
 * Each text or thinking block gets its own Chunker. A block's chunks are
 * sent as they complete; text left waiting is sent once it has waited
 * `CHUNK_MAX_WAIT_MS` since the block last sent; the rest is sent at
 * `content_block_stop`, or before the agent's next whole record, or when
 * the turn ends or the stream stops, whichever comes first.
 */
import {
  CHUNK_MAX_WAIT_MS,
  makeChunker,
  type Chunker,
  type RawOut,
} from '../../../../harness/index.js';

export type Channel = 'text' | 'reasoning';

export const streamIdOf = (messageId: string, index: number): string =>
  `${messageId}:${index}`;

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface Block {
  readonly messageId: string;
  readonly streamId: string;
  readonly channel: Channel;
  readonly agentId: string | null;
  readonly chunker: Chunker;
  /** Every delta so far: what the block's chunks add up to. */
  written: string;
  lastSent: number;
}

export interface StreamChunks {
  /** Feeds one `stream_event` record; returns the chunks it completed. */
  readonly event: (record: Obj, now: number) => ReadonlyArray<RawOut>;
  /**
   * Closes the open blocks of the agent a whole `assistant` record is from;
   * returns their remaining text, to send before that record, and the
   * record with each block they streamed pointing at its chunks.
   */
  readonly whole: (record: Obj) => {
    readonly chunks: ReadonlyArray<RawOut>;
    readonly record: Obj;
  };
  /** The chunks that have waited long enough to be sent anyway. */
  readonly due: (now: number) => ReadonlyArray<RawOut>;
  /** When the next chunk falls due, if any text is waiting. */
  readonly nextDue: () => number | undefined;
  /** Closes every block, returning the text still waiting in them. */
  readonly closeAll: () => ReadonlyArray<RawOut>;
}

const toOut = (block: Block, text: string): RawOut => ({
  kind: 'text.chunk',
  payload: {
    streamId: block.streamId,
    channel: block.channel,
    text,
  },
  ...(block.agentId === null ? {} : { agentId: block.agentId }),
});

const CHANNELS: Readonly<Record<string, Channel>> = {
  text: 'text',
  thinking: 'reasoning',
};

/** The field of a content block that holds its text. */
const FIELDS: Readonly<Record<string, string>> = {
  text: 'text',
  thinking: 'thinking',
};

/** The key of the object a streamed block's text is replaced with. */
export const POINTER = '$stream';

/**
 * A stored whole `assistant` record as Claude Code sent it: each pointer
 * replaced by its stream's chunks, joined. A pointer whose chunks are not
 * given is left as it is.
 */
export const restore = <A>(
  payload: A,
  chunksByStreamId: ReadonlyMap<string, ReadonlyArray<string>>,
): A => {
  if (!isObj(payload) || !isObj(payload['message'])) return payload;
  const message = payload['message'];
  if (!Array.isArray(message['content'])) return payload;
  const content = message['content'].map((item: unknown) => {
    if (!isObj(item)) return item;
    const field = FIELDS[String(item['type'])];
    const pointer = field === undefined ? undefined : item[field];
    const streamId = isObj(pointer) ? pointer[POINTER] : undefined;
    const chunks =
      typeof streamId === 'string' ? chunksByStreamId.get(streamId) : undefined;
    return chunks === undefined ? item : { ...item, [field!]: chunks.join('') };
  });
  return { ...payload, message: { ...message, content } } as A;
};

export const makeStreamChunks = (): StreamChunks => {
  const blocks = new Map<string, Block>();
  const messages = new Map<string, string>();
  const keyOf = (agent: string, index: number) => `${agent}\n${index}`;

  const send = (block: Block, texts: ReadonlyArray<string>, now: number) => {
    if (texts.length > 0) block.lastSent = now;
    return texts.map((text) => toOut(block, text));
  };

  const close = (key: string): ReadonlyArray<RawOut> => {
    const block = blocks.get(key);
    if (block === undefined) return [];
    blocks.delete(key);
    const rest = block.chunker.flush();
    return rest === null ? [] : [toOut(block, rest)];
  };

  return {
    event: (record, now) => {
      const event = record['event'];
      if (!isObj(event)) return [];
      const parent = record['parent_tool_use_id'];
      const agentId = typeof parent === 'string' ? parent : null;
      const agent = agentId ?? '';
      const index = event['index'];
      switch (event['type']) {
        case 'message_start': {
          const message = event['message'];
          const id = isObj(message) ? message['id'] : undefined;
          if (typeof id === 'string') messages.set(agent, id);
          return [];
        }
        case 'content_block_start': {
          const messageId =
            messages.get(agent) ??
            (typeof record['api_message_id'] === 'string'
              ? record['api_message_id']
              : undefined);
          const content = event['content_block'];
          if (messageId === undefined || typeof index !== 'number') return [];
          const channel = isObj(content)
            ? CHANNELS[String(content['type'])]
            : undefined;
          if (channel === undefined) return [];
          blocks.set(keyOf(agent, index), {
            messageId,
            streamId: streamIdOf(messageId, index),
            channel,
            agentId,
            chunker: makeChunker(),
            written: '',
            lastSent: now,
          });
          return [];
        }
        case 'content_block_delta': {
          const delta = event['delta'];
          if (typeof index !== 'number' || !isObj(delta)) return [];
          const block = blocks.get(keyOf(agent, index));
          const text = delta['text'] ?? delta['thinking'];
          if (block === undefined || typeof text !== 'string') return [];
          block.written += text;
          return send(block, block.chunker.push(text), now);
        }
        case 'content_block_stop':
          return typeof index === 'number' ? close(keyOf(agent, index)) : [];
        default:
          return [];
      }
    },
    whole: (record) => {
      const parent = record['parent_tool_use_id'];
      const agentId = typeof parent === 'string' ? parent : null;
      const own = [...blocks].filter(([, block]) => block.agentId === agentId);
      const message = record['message'];
      if (!isObj(message) || !Array.isArray(message['content'])) {
        return { chunks: own.flatMap(([key]) => close(key)), record };
      }
      const unused = own.map(([, block]) => block);
      const content = message['content'].map((item: unknown) => {
        if (!isObj(item)) return item;
        const channel = CHANNELS[String(item['type'])];
        const field = FIELDS[String(item['type'])];
        if (channel === undefined || field === undefined) return item;
        const at = unused.findIndex(
          (block) =>
            block.messageId === message['id'] &&
            block.channel === channel &&
            block.written !== '' &&
            block.written === item[field],
        );
        if (at < 0) return item;
        const [block] = unused.splice(at, 1);
        return { ...item, [field]: { [POINTER]: block!.streamId } };
      });
      return {
        chunks: own.flatMap(([key]) => close(key)),
        record: { ...record, message: { ...message, content } },
      };
    },
    due: (now) =>
      [...blocks.values()].flatMap((block) => {
        if (
          !block.chunker.pending() ||
          now - block.lastSent < CHUNK_MAX_WAIT_MS
        ) {
          return [];
        }
        const rest = block.chunker.flush();
        return rest === null ? [] : send(block, [rest], now);
      }),
    nextDue: () => {
      const waiting = [...blocks.values()]
        .filter((block) => block.chunker.pending())
        .map((block) => block.lastSent + CHUNK_MAX_WAIT_MS);
      return waiting.length === 0 ? undefined : Math.min(...waiting);
    },
    closeAll: () => {
      messages.clear();
      return [...blocks.keys()].flatMap(close);
    },
  };
};
