import type { AnyUnkeyedESchema } from '../../../../eschema/index.js';
import { singletonSnapshotSource } from '../../../../snapshot/capture/table-capture/index.js';
import {
  tableSnapshotSource,
  type TableSnapshotEntity,
} from '../../../../snapshot/capture/table-entity-registry/index.js';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';
import {
  makeSingleEntityBuilder,
  type SingleEntityBuilder,
} from './single-entity-builder.js';
import type { SingleEntityContext } from './single-entity-context.js';
import { makeSingleEntityReader } from './single-entity-reader.js';
import { makeSingleEntityTransaction } from './single-entity-transaction.js';
import { makeSingleEntityWriter } from './single-entity-writer.js';

export type DynamoSingleEntity<
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyUnkeyedESchema,
> = Readonly<
  {
    name: TSchema['name'];
    [tableSnapshotSource]: TableSnapshotEntity[typeof tableSnapshotSource];
  } & ReturnType<typeof makeSingleEntityReader<TTable, TSchema>> &
    ReturnType<typeof makeSingleEntityWriter<TTable, TSchema>> &
    ReturnType<typeof makeSingleEntityTransaction<TTable, TSchema>>
>;

const assembleSingleEntity = <
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyUnkeyedESchema,
>(
  context: SingleEntityContext<TTable, TSchema>,
): DynamoSingleEntity<TTable, TSchema> => {
  const reader = makeSingleEntityReader(context);
  const writer = makeSingleEntityWriter(context, reader.get);
  const transaction = makeSingleEntityTransaction(context, reader.get);

  return Object.freeze({
    name: context.eschema.name,
    [tableSnapshotSource]: () => singletonSnapshotSource(context.eschema),
    ...reader,
    ...writer,
    ...transaction,
  }) satisfies DynamoSingleEntity<TTable, TSchema>;
};

export const makeDynamoSingleEntity = <TTable extends DynamoTable<any, any>>(
  table: TTable,
  onBuild?: (entity: TableSnapshotEntity) => void,
): SingleEntityBuilder<TTable> =>
  makeSingleEntityBuilder(table, assembleSingleEntity, onBuild);

export type { SingleEntityType } from './single-entity-context.js';
export type { SingleEntityDefaultBuilder } from './single-entity-builder.js';
