import type { EncodedKey, JsonObject } from '../contract/index.js';
import { encodeCompositeKey } from './composite-key.js';

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

interface EntityKeySource {
  readonly name: string;
  readonly primary: KeyDerivation;
  readonly accessPatterns: readonly IndexedKeyDerivation[];
}

const stringComponents = (value: JsonObject, fields: readonly string[]) =>
  fields.map((field) => {
    const component = value[field];
    if (typeof component !== 'string')
      throw new Error(`Index component "${field}" must encode to a string`);
    return component;
  });

export const deriveStorageKey = (
  entity: string,
  data: JsonObject,
  derivation: KeyDerivation,
): EncodedKey => ({
  pk: encodeCompositeKey([entity, ...stringComponents(data, derivation.pk)]),
  sk: encodeCompositeKey(stringComponents(data, derivation.sk)),
});

export const deriveStorageIndexes = (
  entity: string,
  patterns: readonly IndexedKeyDerivation[],
  data: JsonObject,
): Record<string, string> =>
  Object.fromEntries(
    patterns.flatMap((pattern) => {
      if (pattern.index === undefined || pattern.attributes === undefined)
        return [];
      const fields = [...pattern.pk, ...pattern.sk];
      if (!fields.every((field) => typeof data[field] === 'string')) return [];
      const key = deriveStorageKey(entity, data, pattern);
      const entries: [string, string][] = [];
      if (pattern.attributes.pk !== undefined)
        entries.push([pattern.attributes.pk, key.pk]);
      entries.push([pattern.attributes.sk, key.sk]);
      return entries;
    }),
  );

export const deriveSnapshotIndexes = (
  entity: EntityKeySource,
  data: JsonObject,
  updated: string,
): Record<string, string> => {
  const value: JsonObject = { ...data, _u: updated };
  return deriveStorageIndexes(entity.name, entity.accessPatterns, value);
};

export const deriveSnapshotKeys = (
  entity: EntityKeySource,
  data: JsonObject,
  updated: string,
) => {
  const value: JsonObject = { ...data, _u: updated };
  return {
    ...deriveStorageKey(entity.name, value, entity.primary),
    keys: deriveSnapshotIndexes(entity, data, updated),
  };
};
