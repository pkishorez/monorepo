import type { AnyUnkeyedESchema } from '../../../../eschema/index.js';
import {
  singletonSnapshotSource,
  tableSnapshotSource,
  type TableSnapshotEntity,
} from '../../../../snapshot/table-adapter/index.js';
import type { IdbEntityTable } from '../idb-entity/index.js';
import {
  makeIdbSingleEntityBuilder,
  type IdbSingleEntityBuilder,
} from './single-entity-builder.js';
import type { IdbSingleEntityContext } from './single-entity-context.js';
import { makeIdbSingleEntityReader } from './single-entity-reader.js';
import { makeIdbSingleEntityTransaction } from './single-entity-transaction.js';
import { makeIdbSingleEntityWriter } from './single-entity-writer.js';

export type IdbSingleEntity<
  TTable extends IdbEntityTable,
  TSchema extends AnyUnkeyedESchema,
> = Readonly<
  {
    name: TSchema['name'];
    [tableSnapshotSource]: TableSnapshotEntity[typeof tableSnapshotSource];
  } & ReturnType<typeof makeIdbSingleEntityReader<TTable, TSchema>> &
    ReturnType<typeof makeIdbSingleEntityWriter<TTable, TSchema>> &
    ReturnType<typeof makeIdbSingleEntityTransaction<TTable, TSchema>>
>;

const assembleIdbSingleEntity = <
  TTable extends IdbEntityTable,
  TSchema extends AnyUnkeyedESchema,
>(
  context: IdbSingleEntityContext<TTable, TSchema>,
): IdbSingleEntity<TTable, TSchema> => {
  const reader = makeIdbSingleEntityReader(context);
  return Object.freeze({
    name: context.eschema.name,
    [tableSnapshotSource]: () => singletonSnapshotSource(context.eschema),
    ...reader,
    ...makeIdbSingleEntityWriter(context, reader.get),
    ...makeIdbSingleEntityTransaction(context, reader.get),
  });
};

export const makeIdbSingleEntity = <TTable extends IdbEntityTable>(
  table: TTable,
  onBuild?: (entity: TableSnapshotEntity) => void,
): IdbSingleEntityBuilder<TTable> =>
  makeIdbSingleEntityBuilder(table, assembleIdbSingleEntity, onBuild);

export type { IdbSingleEntityDefaultBuilder } from './single-entity-builder.js';
