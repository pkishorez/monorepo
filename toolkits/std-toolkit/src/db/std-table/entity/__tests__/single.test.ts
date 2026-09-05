import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema } from '../../../../eschema/index.js';
import { StdTable } from '../../table/index.js';
import { contractLayer } from '../../contract/index.js';
import { makeDeterministicContract } from '../../__tests__/deterministic-contract.js';

describe('portable single entity', () => {
  it('makes put an unconditional upsert when another writer races the read', async () => {
    const table = StdTable.make('single-put').primary('pk', 'sk').build();
    const schema = ESchema.make('Config', { value: Schema.String }).build();
    const config = table.singleEntity(schema).default({ value: 'default' });
    const deterministic = makeDeterministicContract(table.logicalName);
    const contract = {
      ...deterministic.contract,
      getItem: (key: Parameters<typeof deterministic.contract.getItem>[0]) =>
        deterministic.contract.getItem(key).pipe(
          Effect.tap((current) =>
            current === null
              ? Effect.void
              : deterministic.contract.writeItem({
                  item: {
                    ...current,
                    meta: { ...current.meta, _u: `${current.meta._u}-raced` },
                  },
                }),
          ),
        ),
    };
    const layer = contractLayer(table.logicalName, contract);

    await Effect.runPromise(
      config.put({ value: 'first' }).pipe(Effect.provide(layer)),
    );
    const result = await Effect.runPromise(
      config.put({ value: 'second' }).pipe(Effect.provide(layer)),
    );

    expect(result.value).toEqual({ value: 'second' });
  });
});
