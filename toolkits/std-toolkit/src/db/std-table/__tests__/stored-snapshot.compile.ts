import type { SingletonEntity } from '../../../core/index.js';
import type { SnapshotValue } from '../definition/index.js';
import type { TableEffect } from '../entity/index.js';
import { StdTable } from '../table/index.js';

const table = StdTable.make('stored-snapshot').primary('pk', 'sk').build();
const { snapshot, entity, version } = table.storedSnapshot;

// Reads are typed by the internal entities' schemas and keys.
const record: TableEffect<
  SingletonEntity<SnapshotValue>,
  'stored-snapshot'
> = snapshot.get();
entity.get({ name: 'Note' });
version.get({ id: 'Note@v1' });
entity.query('primary', { pk: {}, '>=': null });
version.query('primary', { pk: {}, beginsWith: { id: 'Note@' } });
// @ts-expect-error An entity item is keyed by its name.
entity.get({ id: 'Note' });

// Only setup writes them: each surface has its reads and nothing else, so no
// write method (`put`, `insert`, `getAndUpdate`, `delete`, `restore`, an
// `...Op`) is there.
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
const snapshotReads: Equals<keyof typeof snapshot, 'name' | 'schema' | 'get'> =
  true;
const entityReads: Equals<
  keyof typeof entity,
  'name' | 'schema' | 'get' | 'query'
> = true;
const versionReads: Equals<
  keyof typeof version,
  'name' | 'schema' | 'get' | 'query'
> = true;

// The surfaces cannot be replaced either.
const other = StdTable.make('stored-snapshot').primary('pk', 'sk').build();
// @ts-expect-error `storedSnapshot` is read-only.
table.storedSnapshot = other.storedSnapshot;

void [record, snapshotReads, entityReads, versionReads];
