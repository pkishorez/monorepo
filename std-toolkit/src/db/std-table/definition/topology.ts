import type {
  GlobalSecondaryIndex,
  LocalSecondaryIndex,
  PrimaryIndex,
} from './definition.js';

export interface MutableTopology {
  readonly primary: PrimaryIndex;
  readonly localSecondaryIndexes: Record<string, LocalSecondaryIndex>;
  readonly globalSecondaryIndexes: Record<string, GlobalSecondaryIndex>;
}

const assertName = (kind: string, name: string): void => {
  if (name === '') throw new Error(`${kind} must not be empty`);
};

const reservedAttributes = new Set(['_e', '_v', '_u', '_d', 'data']);
const reservedIndexSlots = new Set(['_entity']);

const assertAttributeName = (kind: string, name: string): void => {
  assertName(kind, name);
  if (reservedAttributes.has(name))
    throw new Error(`${kind} "${name}" is reserved for portable storage`);
};

export const makeTopology = (pk: string, sk: string): MutableTopology => {
  assertAttributeName('Primary partition-key attribute', pk);
  assertAttributeName('Primary sort-key attribute', sk);
  if (pk === sk)
    throw new Error(
      'Primary partition-key and sort-key attributes must differ',
    );
  return {
    primary: Object.freeze({ pk, sk }),
    localSecondaryIndexes: {},
    globalSecondaryIndexes: {},
  };
};

export const copyTopology = (topology: MutableTopology): MutableTopology => ({
  primary: topology.primary,
  localSecondaryIndexes: { ...topology.localSecondaryIndexes },
  globalSecondaryIndexes: { ...topology.globalSecondaryIndexes },
});

export const addIndex = (
  topology: MutableTopology,
  index: LocalSecondaryIndex | GlobalSecondaryIndex,
): void => {
  assertName('Index slot name', index.name);
  if (reservedIndexSlots.has(index.name))
    throw new Error(`Index slot name "${index.name}" is reserved`);
  assertAttributeName('Index partition-key attribute', index.pk);
  assertAttributeName('Index sort-key attribute', index.sk);
  if (index.pk === index.sk)
    throw new Error(
      `Index "${index.name}" partition-key and sort-key attributes must differ`,
    );
  if (
    index.name in topology.localSecondaryIndexes ||
    index.name in topology.globalSecondaryIndexes
  ) {
    throw new Error(`Index slot "${index.name}" is already defined`);
  }
  const usedAttributes = new Set([
    topology.primary.pk,
    topology.primary.sk,
    ...Object.values(topology.localSecondaryIndexes).map(({ sk }) => sk),
    ...Object.values(topology.globalSecondaryIndexes).flatMap(({ pk, sk }) => [
      pk,
      sk,
    ]),
  ]);
  const introducedAttributes =
    index.kind === 'lsi' ? [index.sk] : [index.pk, index.sk];
  const reused = introducedAttributes.find((name) => usedAttributes.has(name));
  if (reused !== undefined)
    throw new Error(
      `Index "${index.name}" key attribute "${reused}" is already used`,
    );
  if (
    index.kind === 'lsi' &&
    Object.keys(topology.localSecondaryIndexes).length >= 5
  ) {
    throw new Error('A Table can define at most 5 LSI slots');
  }
  if (
    index.kind === 'gsi' &&
    Object.keys(topology.globalSecondaryIndexes).length >= 20
  ) {
    throw new Error('A Table can define at most 20 GSI slots');
  }
  const target =
    index.kind === 'lsi'
      ? topology.localSecondaryIndexes
      : topology.globalSecondaryIndexes;
  target[index.name] = Object.freeze(index);
};
