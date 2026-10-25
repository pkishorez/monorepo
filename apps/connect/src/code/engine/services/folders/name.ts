/*
 * Whether a name can be one new folder: a single path segment this
 * machine's file systems all take, without spaces at its ends that would
 * be easy to miss.
 */

/** The longest name, in bytes, that common file systems take. */
const MAX_BYTES = 255;

/** Why `name` cannot name a new folder, or null when it can. */
export const whyNotFolderName = (name: string): string | null => {
  if (name === '') return 'A folder needs a name';
  if (name !== name.trim()) return 'A name cannot start or end with a space';
  if (name === '.' || name === '..') return `${name} is not a folder name`;
  if (name.includes('/')) return 'A name cannot hold /';
  if (name.includes('\0')) return 'A name cannot hold a NUL character';
  if (Buffer.byteLength(name) > MAX_BYTES) return 'That name is too long';
  return null;
};
