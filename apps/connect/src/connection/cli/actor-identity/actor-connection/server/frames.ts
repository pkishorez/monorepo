/*
 * Enough of a WebSocket's frames to find a caller's own close among what it
 * sends, without reading any of it. A caller may send before it reads the
 * close it was told, so a close is not always the first thing to arrive.
 */

/** What is held of a caller's frames at most; one sending more is cut. */
export const MOST_HELD = 64 * 1024;

const CLOSE = 0x8;

/** The bytes the frame at the start of `held` takes; null until all of its header is there. */
const headerOf = (held: Buffer) => {
  if (held.length < 2) return null;
  const short = held[1]! & 0x7f;
  const extra = short === 126 ? 2 : short === 127 ? 8 : 0;
  const header = 2 + extra + (held[1]! & 0x80 ? 4 : 0);
  if (held.length < header) return null;
  const length =
    short === 126
      ? held.readUInt16BE(2)
      : short === 127
        ? Number(held.readBigUInt64BE(2))
        : short;
  return header + length;
};

/** Whether `held` holds a close, and what is left of it once the whole frames before it are gone. */
export const readFrames = (
  held: Buffer,
): { readonly closed: boolean; readonly left: Buffer } => {
  let left = held;
  while (left.length > 0) {
    if ((left[0]! & 0x0f) === CLOSE) return { closed: true, left };
    const size = headerOf(left);
    if (size === null || left.length < size) return { closed: false, left };
    left = left.subarray(size);
  }
  return { closed: false, left };
};
