import { Effect, Stream } from 'effect';
import {
  nextUlid,
  type ChangeNotice,
  type DecodedEntity,
  type DecodedSingleEntity,
} from '../../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import {
  DatabaseError,
  DuplicateTransactionTarget,
  EntityNotFound,
  ForeignTransactionItem,
  PrimaryKeyDrift,
  ReindexConflict,
  TransactFailed,
  type TransactOutcomeStatus,
  TransactionTooLarge,
} from '../error/index.js';
import {
  ConditionFailure,
  StdTableService,
  type ContractFailure,
  type EncodedItem,
  type TransactItem,
} from '../contract/index.js';
import type {
  KeyedEntityDefinition,
  TableDefinition as DefinitionTableDefinition,
} from '../definition/index.js';
import {
  broadcast,
  changesOrEmpty,
  dbError,
  decode,
  encode,
  failReason,
  makeEncodedItem,
  makeKeyedEntity,
  makeSingleEntity,
  type AnyTransactOp,
} from '../entity/index.js';
import { scanStream } from './scan.js';
import type { ScanOptions, StdTable } from './table.js';

type AnyDecoded = DecodedEntity<object> | DecodedSingleEntity<object>;

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

const READ_CONCURRENCY = 12;

const sameKeys = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean => {
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([key, value]) => right[key] === value)
  );
};

/** A database-evaluated condition kind, as the status the caller acts on. */
const conditionStatus = (detail: string | undefined): TransactOutcomeStatus =>
  detail === 'updated' ? 'stale' : 'missing';

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
          status:
            outcome === undefined || outcome.status === 'not-evaluated'
              ? ('not-evaluated' as const)
              : outcome.status === 'passed'
                ? ('passed' as const)
                : conditionStatus(outcome.detail),
          ...(outcome?.detail === undefined ? {} : { detail: outcome.detail }),
          op,
        };
      }),
    }),
  });
};

/** An op refusing before submission, as one outcome per op at its position. */
const refusedAt = (
  ops: readonly AnyTransactOp<string>[],
  index: number,
  reason: DatabaseError['reason'],
) => {
  const status: TransactOutcomeStatus =
    reason._tag === 'CheckRefused' ? 'refused' : 'missing';
  return new DatabaseError({
    reason: new TransactFailed({
      operations: ops.map((op, position) => ({
        status:
          position < index
            ? ('passed' as const)
            : position === index
              ? status
              : ('not-evaluated' as const),
        ...(position === index ? { detail: reason._tag } : {}),
        op,
      })),
    }),
  });
};

const REFUSAL_TAGS = new Set([
  'CheckRefused',
  'NoItemToUpdate',
  'NoItemToCheck',
  'ItemAlreadyExists',
]);

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
        const current = yield* Effect.forEach(
          ops,
          (op) =>
            op.readsCurrent
              ? contract
                  .getItem(op.key, { consistent: true })
                  .pipe(
                    Effect.mapError((error) =>
                      dbError('transact', error as ContractFailure),
                    ),
                  )
              : Effect.succeed(null),
          { concurrency: READ_CONCURRENCY },
        );
        const version = yield* nextUlid;
        const applied = [];
        for (let index = 0; index < ops.length; index++) {
          const op = ops[index] as AnyTransactOp<Name>;
          const result = yield* (
            op.apply(current[index] ?? null, version) as Effect.Effect<
              {
                readonly write: TransactItem;
                readonly entity: AnyDecoded | null;
              },
              DatabaseError
            >
          ).pipe(Effect.result);
          if (result._tag === 'Failure') {
            if (!REFUSAL_TAGS.has(result.failure.reason._tag))
              return yield* Effect.fail(result.failure);
            return yield* Effect.fail(
              refusedAt(ops, index, result.failure.reason),
            );
          }
          applied.push(result.success);
        }
        // One write per op, in order, so a positional outcome report lines up.
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
    // Table-wide: every entity broadcasting through this Broadcaster, not
    // just this table's — Entity Meta carries no table identity to filter by.
    subscribe: (): Stream.Stream<ChangeNotice> => changesOrEmpty(),
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
    scan(options?: ScanOptions) {
      return Stream.unwrap(
        Effect.map(StdTableService(definition.logicalName), (service) =>
          scanStream(service.contract, options?.parallelism ?? 1).pipe(
            Stream.mapError((error) =>
              dbError('scan', error as ContractFailure),
            ),
          ),
        ),
      );
    },
    drift(item: EncodedItem) {
      return Effect.gen(function* () {
        const found = definition.registeredEntities.find(
          (candidate) => candidate.name === item.meta._e,
        );
        if (found === undefined)
          return yield* failReason(
            new EntityNotFound({ entity: item.meta._e }),
          );
        // SingleEntity has no secondary indexes, so its key never drifts.
        if (found.kind === 'single')
          return { drifted: false, currentForm: item };
        const decoded = yield* decode(found.schema, item);
        const encoded = yield* encode(
          found.schema,
          decoded.value,
          found.name,
          item.meta,
        );
        const currentForm = makeEncodedItem(
          found,
          encoded,
          item.meta._u,
          item.meta._d,
        );
        if (item.pk !== currentForm.pk || item.sk !== currentForm.sk)
          return yield* failReason(
            new PrimaryKeyDrift({
              entity: found.name,
              storedKey: { pk: item.pk, sk: item.sk },
              currentKey: { pk: currentForm.pk, sk: currentForm.sk },
            }),
          );
        const drifted = !sameKeys(item.keys, currentForm.keys);
        return { drifted, currentForm };
      });
    },
    reindex(currentForm: EncodedItem) {
      return Effect.gen(function* () {
        const contract = (yield* StdTableService(definition.logicalName))
          .contract;
        yield* contract
          .writeItem({
            item: currentForm,
            condition: { kind: 'updated', value: currentForm.meta._u },
          })
          .pipe(
            Effect.mapError((error) =>
              error instanceof ConditionFailure
                ? new DatabaseError({
                    reason: new ReindexConflict({
                      entity: currentForm.meta._e,
                      observedU: currentForm.meta._u,
                    }),
                  })
                : dbError('reindex', error as ContractFailure),
            ),
          );
      });
    },
  };
  return table as unknown as StdTable<Name>;
};
