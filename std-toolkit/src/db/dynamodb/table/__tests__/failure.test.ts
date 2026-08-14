import { describe, expect, it } from 'vitest';
import {
  ConditionFailure,
  OperationFailure,
} from '../../../std-table/contract/index.js';
import { contractFailure } from '../failure.js';

describe('DynamoDB runtime failure', () => {
  it('maps only conditional transaction cancellations to condition failures', () => {
    expect(
      contractFailure({
        _tag: 'TransactionCanceledException',
        CancellationReasons: [
          { Code: 'None' },
          { Code: 'ConditionalCheckFailed' },
        ],
      }),
    ).toBeInstanceOf(ConditionFailure);
    expect(
      contractFailure({
        _tag: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'TransactionConflict' }],
      }),
    ).toBeInstanceOf(OperationFailure);
    expect(
      contractFailure({ _tag: 'TransactionCanceledException' }),
    ).toBeInstanceOf(OperationFailure);
  });

  it('does not wrap an already normalized runtime failure', () => {
    const failure = new OperationFailure({ cause: Error('invalid') });
    expect(contractFailure(failure)).toBe(failure);
  });
});
