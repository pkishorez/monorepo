/** A chunk is cut at the last sentence end once this much text has built up. */
export const CHUNK_MIN_CHARS = 250;
/** With no sentence end in sight, a chunk is cut here regardless. */
export const CHUNK_MAX_CHARS = 600;
/** Text that has waited this long is sent even if short, so slow streams still show. */
export const CHUNK_MAX_WAIT_MS = 1_500;

// A sentence ends at . ! ? or a newline, followed by whitespace.
const SENTENCE_END = /[.!?\n](?=\s)|\n/g;

const lastSentenceEnd = (text: string): number => {
  let end = -1;
  for (const match of text.matchAll(SENTENCE_END)) end = match.index + 1;
  return end;
};

/**
 * Batches one block's token deltas into chunks of a few sentences. Pure:
 * the caller feeds deltas, asks for a timed flush, and flushes at the end.
 */
export interface Chunker {
  /** Adds a delta; returns the chunks it completed, in order. */
  readonly push: (delta: string) => ReadonlyArray<string>;
  /** Everything waiting, or null if nothing is. */
  readonly flush: () => string | null;
  /** Whether text is waiting. */
  readonly pending: () => boolean;
}

export const makeChunker = (): Chunker => {
  let buffer = '';
  const cut = (): string | null => {
    if (buffer.length < CHUNK_MIN_CHARS) return null;
    const end = lastSentenceEnd(buffer);
    const at =
      end > 0 ? end : buffer.length >= CHUNK_MAX_CHARS ? buffer.length : -1;
    if (at <= 0) return null;
    const chunk = buffer.slice(0, at);
    buffer = buffer.slice(at);
    return chunk;
  };
  return {
    push: (delta) => {
      buffer += delta;
      const chunks: string[] = [];
      for (let chunk = cut(); chunk !== null; chunk = cut()) chunks.push(chunk);
      return chunks;
    },
    flush: () => {
      if (buffer === '') return null;
      const chunk = buffer;
      buffer = '';
      return chunk;
    },
    pending: () => buffer !== '',
  };
};
