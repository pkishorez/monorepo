import { Effect } from 'effect';
import { nextUlid } from '../../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import {
  DatabaseError,
  DuplicateTransactionTarget,
  ForeignTransactionItem,
  TransactFailed,
  TransactionTooLarge,
} from '../error/index.js';
import {
  ConditionFailure,
  StdTableService,
  type ContractFailure,
} from '../contract/index.js';
import type {
  KeyedEntityDefinition,
  TableDefinition as DefinitionTableDefinition,
} from '../definition/index.js';
import {
  broadcast,
  dbError,
  failReason,
  makeKeyedEntity,
  makeSingleEntity,
  type AnyTransactOp,
} from '../entity/index.js';
import type { StdTable } from './table.js';

interface AnyEntityBuilder {
  index(
    slot: string,
    name: string,
    derivation: {
      readonly pk?: readonly string[];
      readonly sk?: readonly string[];
    },
  ): AnyEntityBuilder;
  build(): KeyedEntityDefinition<
    string,
    AnyEntityESchema,
    readonly string[],
    readonly [string]
  >;
}

const transactFailed = (
  ops: readonly AnyTransactOp<string>[],
  failure: ContractFailure,
) => {
  if (!(failure instanceof ConditionFailure))
    return dbError('transact', failure);
  return new DatabaseError({
    reason: new TransactFailed({
      operations: ops.map((op, index) => {
        const outcome = failure.outcomes?.[index];
        return {
          status: outcome?.status ?? 'not-evaluated',
          ...(outcome?.detail === undefined ? {} : { detail: outcome.detail }),
          op,
        };
      }),
    }),
  });
};

const decorateEntityBuilder = (
  builder: AnyEntityBuilder,
): AnyEntityBuilder => ({
  index(slot, name, derivation) {
    return decorateEntityBuilder(builder.index(slot, name, derivation));
  },
  build() {
    return makeKeyedEntity(builder.build());
  },
});

export const decorateTable = <Name extends string>(
  definition: DefinitionTableDefinition<Name>,
): StdTable<Name> => {
  const table = {
    ...definition,
    entity<S extends AnyEntityESchema>(schema: S) {
      const builder = definition.entity(schema);
      return {
        primary(derivation?: { pk: readonly string[] }) {
          const inner = builder.primary(derivation as never);
          return decorateEntityBuilder(inner as unknown as AnyEntityBuilder);
        },
      };
    },
    singleEntity<S extends AnyUnkeyedESchema>(schema: S) {
      const builder = definition.singleEntity(schema);
      return {
        default(value: ESchemaType<S>) {
          return makeSingleEntity(builder.default(value));
        },
      };
    },
    transact(ops: readonly AnyTransactOp<Name>[]) {
      return Effect.gen(function* () {
        if (ops.length === 0) return [] as never;
        if (ops.length > 100)
          return yield* failReason(
            new TransactionTooLarge({ count: ops.length, maximum: 100 }),
          );
        const targets = new Set<string>();
        for (const op of ops) {
          if (op.tableName !== definition.logicalName)
            return yield* failReason(
              new ForeignTransactionItem({
                expectedTable: definition.logicalName,
                actualTable: op.tableName,
              }),
            );
          if (targets.has(op.target))
            return yield* failReason(
              new DuplicateTransactionTarget({ target: op.target }),
            );
          targets.add(op.target);
        }
        const contract = (yield* StdTableService(definition.logicalName))
          .contract;
        const applied = [];
        for (const op of ops)
          applied.push(
            op.operationKind === 'checkOp'
              ? op.apply()
              : op.apply(yield* nextUlid),
          );
        yield* contract
          .transactWriteItems(applied.map(({ write }) => write))
          .pipe(
            Effect.mapError((error) =>
              transactFailed(ops, error as ContractFailure),
            ),
          );
        for (const item of applied)
          if (item.entity !== null) yield* broadcast(item.entity);
        return applied.map(({ entity }) => entity) as never;
      });
    },
    dangerouslyRemoveAllItems(_confirmation: 'I KNOW WHAT I AM DOING') {
      return Effect.gen(function* () {
        const contract = (yield* StdTableService(definition.logicalName))
          .contract;
        const itemsDeleted = yield* contract
          .hardDeleteAllItems()
          .pipe(
            Effect.mapError((error) =>
              dbError('dangerouslyRemoveAllItems', error as ContractFailure),
            ),
          );
        return { itemsDeleted };
      });
    },
  };
  return table as unknown as StdTable<Name>;
};
