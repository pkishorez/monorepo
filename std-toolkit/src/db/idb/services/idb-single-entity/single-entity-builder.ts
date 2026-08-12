import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import type { TableSnapshotEntity } from '../../../../snapshot/capture/table-entity-registry/index.js';
import type { IdbEntityTable } from '../idb-entity/index.js';
import type { IdbSingleEntity } from './idb-single-entity.js';
import { makeIdbSingleEntityContext } from './single-entity-context.js';

export interface IdbSingleEntityBuilder<TTable extends IdbEntityTable> {
  eschema<TSchema extends AnyUnkeyedESchema>(
    eschema: TSchema,
  ): IdbSingleEntityDefaultBuilder<TTable, TSchema>;
}

export interface IdbSingleEntityDefaultBuilder<
  TTable extends IdbEntityTable,
  TSchema extends AnyUnkeyedESchema,
> {
  default(
    defaultValue: Omit<ESchemaType<TSchema>, '_v'>,
  ): IdbSingleEntity<TTable, TSchema>;
}

export const makeIdbSingleEntityBuilder = <TTable extends IdbEntityTable>(
  table: TTable,
  assemble: <TSchema extends AnyUnkeyedESchema>(
    context: ReturnType<typeof makeIdbSingleEntityContext<TTable, TSchema>>,
  ) => IdbSingleEntity<TTable, TSchema>,
  onBuild?: (entity: TableSnapshotEntity) => void,
): IdbSingleEntityBuilder<TTable> => ({
  eschema<TSchema extends AnyUnkeyedESchema>(eschema: TSchema) {
    return {
      default(defaultValue: Omit<ESchemaType<TSchema>, '_v'>) {
        const entity = assemble(
          makeIdbSingleEntityContext(
            table,
            eschema,
            defaultValue as ESchemaType<TSchema>,
          ),
        );
        onBuild?.(entity);
        return entity;
      },
    };
  },
});
