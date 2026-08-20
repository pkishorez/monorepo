import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Ulid } from '../../../core/index.js';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import { StdTable } from '../table/index.js';
import { OperationFailure, contractLayer } from '../contract/index.js';
import { makeDeterministicContract } from './deterministic-contract.js';

const table = StdTable.make('op-construction').primary('pk', 'sk').build();
const schema = EntityESchema.make('Task', 'taskId', {
  bucket: Schema.String,
  label: Schema.String,
}).build();
const task = table
  .entity(schema)
  .primary({ pk: ['bucket'] })
  .build();
const settings = table
  .singleEntity(ESchema.make('Settings', { theme: Schema.String }).build())
  .default({ theme: 'light' });

const key = { taskId: 't1', bucket: 'inbox' };
const value = { ...key, label: 'Write it down' };

/**
 * Building an op must not touch the database. The rule is invisible in a diff,
 * so it is pinned here: every constructor runs against a contract whose reads
 * throw, and every one of them must still produce an op.
 */
describe('transact ops carry intent only', () => {
  const deterministic = makeDeterministicContract(table.logicalName);
  let reads = 0;
  const contract = {
    ...deterministic.contract,
    getItem: () => {
      reads++;
      return Effect.fail(
        new OperationFailure({
          cause: new Error('An op constructor must not read'),
        }),
      );
    },
  };
  const run = <A>(effect: Effect.Effect<A, unknown, unknown>) =>
    Effect.runPromise(
      (effect as Effect.Effect<A, unknown, never>).pipe(
        Effect.provide(contractLayer(table.logicalName, contract)),
        Effect.provideService(Ulid, () => '01ARZ3NDEKTSV4RRFFQ69G5FAV'),
      ) as Effect.Effect<A, never, never>,
    );

  it('builds every keyed op without a read', async () => {
    const ops = await run(
      Effect.all([
        task.insertOp(value),
        task.getAndUpdateOp(key, { label: 'changed' }),
        task.getAndUpdateOp(key, (current) => ({ label: current.label })),
        task.getAndUpdateOp(
          key,
          { label: 'checked' },
          { check: (current) => current.label !== '' },
        ),
        task.deleteOp(key),
        task.restoreOp(key),
        task.getAndCheckOp(key, (current) => current.label !== ''),
        task.existsOp(key),
        task.notExistsOp(key),
        task.unchangedOp({
          value,
          meta: { _e: 'Task', _u: '01ARZ3NDEKTSV4RRFFQ69G5FAV', _d: false },
        }),
      ]),
    );
    expect(reads).toBe(0);
    expect(ops).toHaveLength(10);
    expect(ops.map((op) => op.readsCurrent)).toEqual([
      false, // insertOp
      true, // getAndUpdateOp
      true,
      true,
      true, // deleteOp
      true, // restoreOp
      true, // getAndCheckOp
      false, // existsOp
      false, // notExistsOp
      false, // unchangedOp
    ]);
  });

  it('builds every single-entity op without a read', async () => {
    const before = reads;
    const ops = await run(
      Effect.all([
        settings.getAndUpdateOp({ theme: 'dark' }),
        settings.getAndUpdateOp((current) => ({ theme: current.theme })),
        settings.getAndUpdateOp(
          { theme: 'checked' },
          { check: (current) => current.theme !== '' },
        ),
        settings.unchangedOp({
          value: { theme: 'light' },
          meta: { _e: 'Settings', _u: '' },
        }),
      ]),
    );
    expect(reads).toBe(before);
    expect(ops.map((op) => op.readsCurrent)).toEqual([true, true, true, false]);
  });
});
