import {
  ConditionFailure,
  OperationFailure,
} from '../../std-table/contract/index.js';

const failureTag = (cause: unknown) =>
  typeof cause === 'object' && cause !== null && '_tag' in cause
    ? String(cause._tag)
    : '';

const isConditionalTransactionCancellation = (cause: unknown) => {
  if (failureTag(cause) !== 'TransactionCanceledException') return false;
  const reasons = (cause as { readonly CancellationReasons?: unknown })
    .CancellationReasons;
  if (!Array.isArray(reasons)) return false;
  const codes = reasons.flatMap((reason) =>
    typeof reason === 'object' && reason !== null && 'Code' in reason
      ? [String(reason.Code)]
      : [],
  );
  return (
    codes.includes('ConditionalCheckFailed') &&
    codes.every((code) => code === 'None' || code === 'ConditionalCheckFailed')
  );
};

export const contractFailure = (cause: unknown) =>
  cause instanceof ConditionFailure || cause instanceof OperationFailure
    ? cause
    : failureTag(cause) === 'ConditionalCheckFailedException' ||
        isConditionalTransactionCancellation(cause)
      ? new ConditionFailure()
      : new OperationFailure({ cause });
