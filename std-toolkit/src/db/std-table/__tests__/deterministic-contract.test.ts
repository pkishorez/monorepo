import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Ulid } from '../../../core/index.js';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../table/index.js';
import { ConditionFailure, contractLayer } from '../contract/index.js';
import { makeDeterministicContract } from './deterministic-contract.js';

describe('portable optimistic retry', () => {
  it('re-reads and re-runs the callback after a condition conflict', async () => {
    const table = StdTable.make('retry-test').primary('pk', 'sk').build();
    const schema = EntityESchema.make('Counter', 'counterId', {
      count: Schema.Number,
    }).build();
    const counter = table.entity(schema).primary().build();
    const deterministic = makeDeterministicContract(table.logicalName);
    let conflicts = 0;
    let callbacks = 0;
    const contract = {
      ...deterministic.contract,
      writeItem: (
        request: Parameters<typeof deterministic.contract.writeItem>[0],
      ) =>
        request.condition?.kind === 'updated' && conflicts++ === 0
          ? Effect.fail(new ConditionFailure())
          : deterministic.contract.writeItem(request),
    };

    const updated = await Effect.runPromise(
      Effect.gen(function* () {
        yield* counter.insert({ counterId: 'one', count: 0 });
        return yield* counter.getAndUpdate(
          { counterId: 'one' },
          ({ count }) => {
            callbacks++;
            return { count: count + 1 };
          },
        );
      }).pipe(
        Effect.provide(contractLayer(table.logicalName, contract)),
        Effect.provideService(Ulid, () => String(callbacks).padStart(26, '0')),
      ),
    );

    expect(updated.value.count).toBe(1);
    expect(callbacks).toBe(2);
  });
});
