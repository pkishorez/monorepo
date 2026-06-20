/**
 * Failure modes of a Source-of-Truth write. Storage/projection failures are
 * deferred — an in-memory map cannot fail; add them when persistence lands.
 */
export type WriteError =
  | { _tag: 'WrongEntity'; expected: string; received: string }
  | { _tag: 'MissingId'; entity: unknown }
  | { _tag: 'Invalid'; reason: string };
