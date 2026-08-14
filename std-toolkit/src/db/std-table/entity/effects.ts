import { Effect, Option } from 'effect';
import {
  Broadcaster,
  type EntityType,
  type SingleEntityType,
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
  entity: EntityType<object> | SingleEntityType<object>,
) =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(Broadcaster).pipe(
      Effect.map(Option.getOrNull),
    );
    service?.broadcast([entity as EntityType<object>]);
  });
