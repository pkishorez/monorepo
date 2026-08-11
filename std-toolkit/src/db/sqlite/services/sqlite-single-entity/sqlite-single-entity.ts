import type { AnyUnkeyedESchema } from '../../../../eschema/index.js';
import { singletonSnapshotSource } from '../../../../snapshot/capture/table-capture/index.js';
import {
  tableSnapshotSource,
  type TableSnapshotEntity,
} from '../../../domain/entity-registry/index.js';
import type { SQLiteEntityTable } from '../sqlite-entity/index.js';
import {
  makeSQLiteSingleEntityBuilder,
  type SQLiteSingleEntityBuilder,
} from './single-entity-builder.js';
import type { SQLiteSingleEntityContext } from './single-entity-context.js';
import { makeSQLiteSingleEntityReader } from './single-entity-reader.js';
import { makeSQLiteSingleEntityTransaction } from './single-entity-transaction.js';
import { makeSQLiteSingleEntityWriter } from './single-entity-writer.js';

export type SQLiteSingleEntity<
  TTable extends SQLiteEntityTable,
  TSchema extends AnyUnkeyedESchema,
> = Readonly<
  {
    name: TSchema['name'];
    [tableSnapshotSource]: TableSnapshotEntity[typeof tableSnapshotSource];
  } & ReturnType<typeof makeSQLiteSingleEntityReader<TTable, TSchema>> &
    ReturnType<typeof makeSQLiteSingleEntityWriter<TTable, TSchema>> &
    ReturnType<typeof makeSQLiteSingleEntityTransaction<TTable, TSchema>>
>;

const assembleSQLiteSingleEntity = <
  TTable extends SQLiteEntityTable,
  TSchema extends AnyUnkeyedESchema,
>(
  context: SQLiteSingleEntityContext<TTable, TSchema>,
): SQLiteSingleEntity<TTable, TSchema> => {
  const reader = makeSQLiteSingleEntityReader(context);
  return Object.freeze({
    name: context.eschema.name,
    [tableSnapshotSource]: () => singletonSnapshotSource(context.eschema),
    ...reader,
    ...makeSQLiteSingleEntityWriter(context, reader.get),
    ...makeSQLiteSingleEntityTransaction(context, reader.get),
  });
};

export const makeSQLiteSingleEntity = <TTable extends SQLiteEntityTable>(
  table: TTable,
  onBuild?: (entity: TableSnapshotEntity) => void,
): SQLiteSingleEntityBuilder<TTable> =>
  makeSQLiteSingleEntityBuilder(table, assembleSQLiteSingleEntity, onBuild);

export type { SingleEntityType } from './single-entity-context.js';
export type { SQLiteSingleEntityDefaultBuilder } from './single-entity-builder.js';
