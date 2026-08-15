import { describe, expect, it } from 'vitest';
import {
  ConditionFailure,
  OperationFailure,
  type ItemCondition,
  type TransactItem,
} from '../../../std-table/contract/index.js';
import { contractFailure, transactFailure } from '../failure.js';

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

  const check = (kind: ItemCondition['kind']): TransactItem => ({
    kind: 'check',
    key: { pk: 'pk', sk: 'sk' },
    condition: kind === 'updated' ? { kind, value: 'u' } : { kind },
  });

  it('maps every transaction cancellation reason to a positional outcome', () => {
    const failure = transactFailure(
      [check('exists'), check('exists'), check('exists'), check('exists')],
      {
        _tag: 'TransactionCanceledException',
        CancellationReasons: [
          { Code: 'None' },
          { Code: 'TransactionConflict' },
          { Code: 'ThrottlingError' },
          { Code: 'ValidationError' },
        ],
      },
    );

    expect(failure).toBeInstanceOf(ConditionFailure);
    expect(failure).toMatchObject({
      outcomes: [
        { status: 'passed' },
        { status: 'failed', detail: 'TransactionConflict' },
        { status: 'failed', detail: 'ThrottlingError' },
        { status: 'failed', detail: 'ValidationError' },
      ],
    });
  });

  it('reports a refused condition as its condition kind, not the DynamoDB code', () => {
    const failure = transactFailure(
      [check('updated'), check('not-exists'), check('exists')],
      {
        _tag: 'TransactionCanceledException',
        CancellationReasons: [
          { Code: 'ConditionalCheckFailed' },
          { Code: 'ConditionalCheckFailed' },
          { Code: 'None' },
        ],
      },
    );

    expect(failure).toMatchObject({
      outcomes: [
        { status: 'failed', detail: 'updated' },
        { status: 'failed', detail: 'not-exists' },
        { status: 'passed' },
      ],
    });
  });

  it('keeps cancellations without reasons as operation failures', () => {
    expect(
      transactFailure([check('exists')], {
        _tag: 'TransactionCanceledException',
      }),
    ).toBeInstanceOf(OperationFailure);
  });
});
