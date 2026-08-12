import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import type { TableSnapshotEntity } from '../../../../snapshot/capture/table-entity-registry/index.js';
import type { SQLiteEntityTable } from '../sqlite-entity/index.js';
import type { SQLiteSingleEntity } from './sqlite-single-entity.js';
import { makeSQLiteSingleEntityContext } from './single-entity-context.js';

export interface SQLiteSingleEntityBuilder<TTable extends SQLiteEntityTable> {
  eschema<TSchema extends AnyUnkeyedESchema>(
    eschema: TSchema,
  ): SQLiteSingleEntityDefaultBuilder<TTable, TSchema>;
}

export interface SQLiteSingleEntityDefaultBuilder<
  TTable extends SQLiteEntityTable,
  TSchema extends AnyUnkeyedESchema,
> {
  default(
    defaultValue: Omit<ESchemaType<TSchema>, '_v'>,
  ): SQLiteSingleEntity<TTable, TSchema>;
}

export const makeSQLiteSingleEntityBuilder = <TTable extends SQLiteEntityTable>(
  table: TTable,
  assemble: <TSchema extends AnyUnkeyedESchema>(
    context: ReturnType<typeof makeSQLiteSingleEntityContext<TTable, TSchema>>,
  ) => SQLiteSingleEntity<TTable, TSchema>,
  onBuild?: (entity: TableSnapshotEntity) => void,
): SQLiteSingleEntityBuilder<TTable> => ({
  eschema<TSchema extends AnyUnkeyedESchema>(eschema: TSchema) {
    return {
      default(defaultValue: Omit<ESchemaType<TSchema>, '_v'>) {
        const entity = assemble(
          makeSQLiteSingleEntityContext(
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
