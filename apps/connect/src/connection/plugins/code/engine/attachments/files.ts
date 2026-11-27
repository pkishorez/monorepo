/** Image types every harness takes inline, and the most it takes of one. */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Bytes in a base64 string, counted as Node's `Buffer.byteLength` does. */
export const sizeOf = (base64: string) => {
  let length = base64.length;
  if (base64.endsWith('=')) length -= 1;
  if (length > 1 && base64[length - 1] === '=') length -= 1;
  return (length * 3) >>> 2;
};

/**
 * The bytes of a base64 string, read as leniently as Node's `Buffer.from`:
 * URL-safe letters taken, anything else skipped, padding optional.
 */
export const bytesOf = (base64: string) => {
  const letters = base64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/]/g, '');
  // A lone last letter holds no whole byte.
  const whole = letters.slice(
    0,
    letters.length - (letters.length % 4 === 1 ? 1 : 0),
  );
  const binary = atob(whole.padEnd(Math.ceil(whole.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export const isImage = (mime: string, size: number) =>
  IMAGE_TYPES.includes(mime.toLowerCase()) && size <= IMAGE_MAX_BYTES;

/** A file name safe on any disk: no folders, no leading dots, nothing odd. */
export const safeName = (name: string) =>
  name
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-100) || 'file';
