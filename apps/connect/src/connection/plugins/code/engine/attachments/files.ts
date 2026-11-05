/** Image types every harness takes inline, and the most it takes of one. */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Bytes in a base64 string. */
export const sizeOf = (base64: string) => Buffer.byteLength(base64, 'base64');

export const isImage = (mime: string, size: number) =>
  IMAGE_TYPES.includes(mime.toLowerCase()) && size <= IMAGE_MAX_BYTES;

/** A file name safe on any disk: no folders, no leading dots, nothing odd. */
export const safeName = (name: string) =>
  name
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-100) || 'file';
