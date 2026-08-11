import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import type { TableSnapshotEntity } from '../../../domain/entity-registry/index.js';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';
import type { DynamoSingleEntity } from './dynamo-single-entity.js';
import { makeSingleEntityContext } from './single-entity-context.js';

export interface SingleEntityBuilder<TTable extends DynamoTable<any, any>> {
  eschema<TSchema extends AnyUnkeyedESchema>(
    eschema: TSchema,
  ): SingleEntityDefaultBuilder<TTable, TSchema>;
}

export interface SingleEntityDefaultBuilder<
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyUnkeyedESchema,
> {
  default(
    defaultValue: Omit<ESchemaType<TSchema>, '_v'>,
  ): DynamoSingleEntity<TTable, TSchema>;
}

export const makeSingleEntityBuilder = <TTable extends DynamoTable<any, any>>(
  table: TTable,
  assemble: <TSchema extends AnyUnkeyedESchema>(
    context: ReturnType<typeof makeSingleEntityContext<TTable, TSchema>>,
  ) => DynamoSingleEntity<TTable, TSchema>,
  onBuild?: (entity: TableSnapshotEntity) => void,
): SingleEntityBuilder<TTable> => ({
  eschema<TSchema extends AnyUnkeyedESchema>(eschema: TSchema) {
    return {
      default(defaultValue: Omit<ESchemaType<TSchema>, '_v'>) {
        const entity = assemble(
          makeSingleEntityContext(
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
