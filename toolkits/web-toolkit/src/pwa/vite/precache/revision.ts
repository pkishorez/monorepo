import { createHash } from 'node:crypto';

/** Content hash of one file; the Precache re-downloads a URL when it changes. */
export const revisionOf = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 16);
