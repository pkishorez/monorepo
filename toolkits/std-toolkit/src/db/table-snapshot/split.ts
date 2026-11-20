import { Effect } from 'effect';
import { TableSnapshot } from '../../snapshot/index.js';
import type {
  SnapshotEntityValue,
  SnapshotValue,
  SnapshotVersionValue,
} from '../std-table/definition/index.js';
import type { TableMode } from './refusal.js';

/** A table snapshot and its mode, as the three internal entities hold them. */
export interface SnapshotValues {
  readonly snapshot: SnapshotValue;
  readonly entities: readonly SnapshotEntityValue[];
  readonly versions: readonly SnapshotVersionValue[];
}

/**
 * A Stored snapshot, joined: the table snapshot, its mode, and the order the
 * table declares its local secondary indexes in, which the snapshot does not
 * keep.
 */
export interface StoredTableSnapshot {
  readonly snapshot: TableSnapshot;
  readonly mode: TableMode;
  readonly localIndexOrder: readonly string[];
}

/** The stored items do not join into a table snapshot this release reads. */
export class SnapshotUnreadable extends Error {
  readonly _tag = 'SnapshotUnreadable';

  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'SnapshotUnreadable';
  }
}

export const versionId = (schema: string, version: string): string =>
  `${schema}@${version}`;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const byName = <T extends { readonly name: string }>(items: readonly T[]) =>
  [...items].sort((left, right) => compare(left.name, right.name));

/**
 * The indexes in the order given; any the order leaves out keep their place
 * after it, by name.
 */
const inOrder = <T extends { readonly name: string }>(
  indexes: readonly T[],
  order: readonly string[],
) => {
  const rank = (name: string) => {
    const at = order.indexOf(name);
    return at === -1 ? order.length : at;
  };
  return [...indexes].sort((left, right) => rank(left.name) - rank(right.name));
};

/**
 * The items the three internal entities hold for a table snapshot and mode.
 * `localIndexOrder` is the order the table declares its local secondary
 * indexes in, which the snapshot does not keep (it sorts them by name) but
 * DynamoDB replaces a table on; `__snapshot` keeps them in it. It defaults
 * to the snapshot's order.
 */
export const splitTableSnapshot = (
  snapshot: TableSnapshot,
  mode: TableMode,
  localIndexOrder: readonly string[] = [],
): SnapshotValues => ({
  snapshot: {
    logicalName: snapshot.logicalName,
    mode,
    primary: snapshot.topology.primary,
    localSecondaryIndexes: inOrder(
      snapshot.topology.localSecondaryIndexes,
      localIndexOrder,
    ),
    globalSecondaryIndexes: snapshot.topology.globalSecondaryIndexes,
  },
  entities: snapshot.entities,
  versions: snapshot.schemas.flatMap((schema) =>
    schema.versions.map((version, position) => ({
      id: versionId(schema.identity, version.version),
      schema: schema.identity,
      version: version.version,
      position,
      kind: schema.kind,
      idField: schema.idField,
      shape: version.shape,
    })),
  ),
});

const joinSchemas = (versions: readonly SnapshotVersionValue[]) => {
  const bySchema = new Map<string, SnapshotVersionValue[]>();
  for (const version of versions) {
    const list = bySchema.get(version.schema) ?? [];
    list.push(version);
    bySchema.set(version.schema, list);
  }
  return [...bySchema.entries()]
    .sort(([left], [right]) => compare(left, right))
    .map(([identity, list]) => {
      const ordered = [...list].sort(
        (left, right) => left.position - right.position,
      );
      const [first] = ordered as [SnapshotVersionValue];
      ordered.forEach((version, position) => {
        if (version.kind !== first.kind || version.idField !== first.idField)
          throw new SnapshotUnreadable(
            `Stored versions of ESchema "${identity}" disagree on its kind or id field`,
          );
        if (version.position !== position)
          throw new SnapshotUnreadable(
            `Stored versions of ESchema "${identity}" do not run from position 0 without a gap`,
          );
        if (version.id !== versionId(identity, version.version))
          throw new SnapshotUnreadable(
            `Stored version "${version.id}" is not keyed by its ESchema and version`,
          );
      });
      return {
        identity,
        kind: first.kind,
        idField: first.idField,
        versions: ordered.map(({ version, shape }) => ({ version, shape })),
      };
    });
};

/**
 * The stored table snapshot and mode, and the order `__snapshot` keeps the
 * local secondary indexes in. Fails when version items of one schema
 * disagree on its kind or id field, when a schema's positions have a gap, or
 * when the result is no valid table snapshot.
 */
export const joinTableSnapshot = (
  values: SnapshotValues,
): Effect.Effect<StoredTableSnapshot, SnapshotUnreadable> =>
  Effect.try({
    try: (): TableSnapshot => ({
      logicalName: values.snapshot.logicalName,
      topology: {
        primary: values.snapshot.primary,
        localSecondaryIndexes: byName(values.snapshot.localSecondaryIndexes),
        globalSecondaryIndexes: byName(values.snapshot.globalSecondaryIndexes),
      },
      entities: byName(values.entities),
      schemas: joinSchemas(values.versions),
    }),
    catch: (cause) =>
      cause instanceof SnapshotUnreadable
        ? cause
        : new SnapshotUnreadable('Stored snapshot items do not join', cause),
  }).pipe(
    // Serializing and parsing back runs every check a snapshot file gets.
    Effect.flatMap((joined) =>
      TableSnapshot.serialize(joined).pipe(Effect.flatMap(TableSnapshot.parse)),
    ),
    Effect.mapError((cause) =>
      cause instanceof SnapshotUnreadable
        ? cause
        : new SnapshotUnreadable(cause.message, cause),
    ),
    Effect.map((snapshot) => ({
      snapshot,
      mode: values.snapshot.mode,
      localIndexOrder: values.snapshot.localSecondaryIndexes.map(
        ({ name }) => name,
      ),
    })),
  );
