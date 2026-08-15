import {
  ConditionFailure,
  OperationFailure,
  conditionFailed,
  type ItemOutcome,
  type TransactItem,
} from '../../std-table/contract/index.js';

const failureTag = (cause: unknown) =>
  typeof cause === 'object' && cause !== null && '_tag' in cause
    ? String(cause._tag)
    : '';

const cancellationReasons = (cause: unknown): readonly string[] | undefined => {
  if (failureTag(cause) !== 'TransactionCanceledException') return undefined;
  const reasons = (cause as { readonly CancellationReasons?: unknown })
    .CancellationReasons;
  if (!Array.isArray(reasons)) return undefined;
  return reasons.map((reason) =>
    typeof reason === 'object' && reason !== null && 'Code' in reason
      ? String(reason.Code)
      : 'None',
  );
};

const isConditionalTransactionCancellation = (codes: readonly string[]) =>
  codes.includes('ConditionalCheckFailed') &&
  codes.every((code) => code === 'None' || code === 'ConditionalCheckFailed');

export const contractFailure = (cause: unknown) => {
  if (cause instanceof ConditionFailure || cause instanceof OperationFailure)
    return cause;
  const codes = cancellationReasons(cause);
  return failureTag(cause) === 'ConditionalCheckFailedException' ||
    (codes !== undefined && isConditionalTransactionCancellation(codes))
    ? conditionFailed()
    : new OperationFailure({ cause });
};

// DynamoDB evaluates every item, so its cancellation reasons carry a status per
// operation rather than a single failing position. A refused condition reports the
// condition kind, matching every other adapter; any other cancellation code is a
// non-condition failure and is reported verbatim.
export const transactFailure = (
  requests: readonly TransactItem[],
  cause: unknown,
) => {
  if (cause instanceof ConditionFailure || cause instanceof OperationFailure)
    return cause;
  const codes = cancellationReasons(cause);
  if (codes === undefined) return contractFailure(cause);
  const outcomes: readonly ItemOutcome[] = requests.map((request, index) => {
    const code = codes[index] ?? 'None';
    if (code === 'None') return { status: 'passed' };
    const detail =
      code === 'ConditionalCheckFailed'
        ? (request.condition?.kind ?? code)
        : code;
    return { status: 'failed', detail };
  });
  return new ConditionFailure({ outcomes });
};
