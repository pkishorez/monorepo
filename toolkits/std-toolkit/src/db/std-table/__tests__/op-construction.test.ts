import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Ulid } from '../../../core/index.js';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import { StdTable } from '../table/index.js';
import { OperationFailure, contractLayer } from '../contract/index.js';
import { makeDeterministicContract } from './deterministic-contract.js';

const schema = EntityESchema.make('Task', 'taskId', {
  bucket: Schema.String,
  label: Schema.String,
}).build();
const table = StdTable.make('op-construction')
  .primary('pk', 'sk')
  .entity(schema, (e) => e.primary({ pk: ['bucket'] }))
  .singleEntity(ESchema.make('Settings', { theme: Schema.String }).build(), {
    default: { theme: 'light' },
  })
  .build();
const settings = table.Settings;

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
        table.Task.insertOp(value),
        table.Task.getAndUpdateOp(key, { label: 'changed' }),
        table.Task.getAndUpdateOp(key, (current) => ({ label: current.label })),
        table.Task.getAndUpdateOp(
          key,
          { label: 'checked' },
          { check: (current) => current.label !== '' },
        ),
        table.Task.deleteOp(key),
        table.Task.restoreOp(key),
        table.Task.getAndCheckOp(key, (current) => current.label !== ''),
        table.Task.existsOp(key),
        table.Task.notExistsOp(key),
        table.Task.unchangedOp({
          value,
          meta: {
            _e: 'Task',
            _v: 'v1',
            _u: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
            _d: false,
          },
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
          meta: { _e: 'Settings', _v: 'v1', _u: '' },
        }),
      ]),
    );
    expect(reads).toBe(before);
    expect(ops.map((op) => op.readsCurrent)).toEqual([true, true, true, false]);
  });
});
