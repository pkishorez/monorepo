export const MOST_HELD = 64 * 1024;

const CLOSE = 0x8;

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
