import { Effect, Equal, Option, Stream } from 'effect';
import {
  Broadcaster,
  type ChangeNotice,
  type Entity,
  type SingletonEntity,
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

export const broadcast = (entity: Entity<object> | SingletonEntity<object>) =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(Broadcaster).pipe(
      Effect.map(Option.getOrNull),
    );
    service?.broadcast([entity as Entity<object>]);
  });

const matchesFilter = <T extends object>(
  value: T,
  filter: Partial<T> | undefined,
): boolean =>
  filter === undefined ||
  Object.keys(filter).every((key) =>
    Equal.equals(
      (value as Record<string, unknown>)[key],
      (filter as Record<string, unknown>)[key],
    ),
  );

export const changesOrEmpty = (): Stream.Stream<Entity<any>> =>
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
