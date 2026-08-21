import { Effect, Option, Stream } from 'effect';
import {
  Broadcaster,
  type ChangeNotice,
  type DecodedEntity,
  type DecodedSingleEntity,
} from '../../../core/index.js';
import {
  ConditionFailed,
  DatabaseError,
  OperationFailed,
} from '../error/index.js';
import { ConditionFailure, type ContractFailure } from '../contract/index.js';

export const dbError = (
  operation: string,
  failure: ContractFailure,
  entity?: string,
): DatabaseError => {
  if (failure instanceof ConditionFailure)
    return new DatabaseError({
      reason: new ConditionFailed({ entity: entity ?? '' }),
    });
  return new DatabaseError({
    reason: new OperationFailed({ operation, cause: failure.cause }),
  });
};

export const failReason = (reason: DatabaseError['reason']) =>
  Effect.fail(new DatabaseError({ reason }));

export const broadcast = (
  entity: DecodedEntity<object> | DecodedSingleEntity<object>,
) =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(Broadcaster).pipe(
      Effect.map(Option.getOrNull),
    );
    service?.broadcast([entity as DecodedEntity<object>]);
  });

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object'
  ) {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = Object.keys(aRecord);
    return (
      keys.length === Object.keys(bRecord).length &&
      keys.every((key) => deepEqual(aRecord[key], bRecord[key]))
    );
  }
  return false;
};

const matchesFilter = <T extends object>(
  value: T,
  filter: Partial<T> | undefined,
): boolean =>
  filter === undefined ||
  Object.keys(filter).every((key) =>
    deepEqual(
      (value as Record<string, unknown>)[key],
      (filter as Record<string, unknown>)[key],
    ),
  );

export const changesOrEmpty = (): Stream.Stream<DecodedEntity<any>> =>
  Stream.unwrap(
    Effect.serviceOption(Broadcaster).pipe(
      Effect.map((service) =>
        Option.match(service, {
          onNone: () => Stream.empty,
          onSome: (broadcaster) => broadcaster.changes,
        }),
      ),
    ),
  );

export const subscribe = <T extends object>(
  entityName: string,
  filter: Partial<T> | undefined,
): Stream.Stream<ChangeNotice<T>> =>
  changesOrEmpty().pipe(
    Stream.filter(
      (notice) =>
        notice.meta._e === entityName &&
        matchesFilter(notice.value as T, filter),
    ),
  ) as Stream.Stream<ChangeNotice<T>>;
