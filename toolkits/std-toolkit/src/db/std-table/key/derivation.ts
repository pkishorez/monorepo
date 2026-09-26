import type { StoredKey } from '../contract/index.js';
import { encodeCompositeKey } from './composite-key.js';
import { encodeKeyPart, type KeyReader } from './key-part.js';

interface KeyDerivation {
  readonly pk: readonly string[];
  readonly sk: readonly string[];
}

export interface IndexAttributes {
  readonly pk?: string | undefined;
  readonly sk: string;
}

interface IndexedKeyDerivation extends KeyDerivation {
  readonly index?: string | undefined;
  readonly attributes?: IndexAttributes | undefined;
}

const parts = (read: KeyReader, components: readonly string[]) =>
  components.map((component) => {
    const part = read(component);
    if (part === undefined)
      throw new Error(`Index component "${component}" has no string or number`);
    return encodeKeyPart(part);
  });

/** Encodes the sort-key components alone, as a query bound or position. */
export const deriveSortKey = (read: KeyReader, components: readonly string[]) =>
  encodeCompositeKey(parts(read, components));

export const deriveStorageKey = (
  entity: string,
  read: KeyReader,
  derivation: KeyDerivation,
): StoredKey => ({
  pk: encodeCompositeKey([entity, ...parts(read, derivation.pk)]),
  sk: deriveSortKey(read, derivation.sk),
});

/**
 * Secondary-index keys for every pattern the value belongs to. A pattern whose
 * component is absent — a missing union branch or a `null` step — is sparse:
 * the item is simply not in that index.
 */
export const deriveStorageIndexes = (
  entity: string,
  patterns: readonly IndexedKeyDerivation[],
  read: KeyReader,
): Record<string, string> =>
  Object.fromEntries(
    patterns.flatMap((pattern) => {
      if (pattern.index === undefined || pattern.attributes === undefined)
        return [];
      const components = [...pattern.pk, ...pattern.sk];
      if (components.some((component) => read(component) === undefined))
        return [];
      const key = deriveStorageKey(entity, read, pattern);
      const entries: [string, string][] = [];
      if (pattern.attributes.pk !== undefined)
        entries.push([pattern.attributes.pk, key.pk]);
      entries.push([pattern.attributes.sk, key.sk]);
      return entries;
    }),
  );
