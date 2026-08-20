import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../eschema/index.js';
import { EntitySchema } from '../entity-schema/index.js';

const counter = EntityESchema.make('Counter', 'id', {
  count: Schema.NumberFromString,
})
  .evolve('v2', { label: Schema.String }, (previous) => ({
    ...previous,
    label: `count-${previous.count}`,
  }))
  .build();

const encodedV1 = {
  value: { _v: 'v1', id: 'one', count: '2' },
  meta: { _e: 'Counter', _u: '1', _d: false },
} as const;

describe('EntitySchema', () => {
  it('decodes an older encoded entity into the latest decoded entity', async () => {
    const decoded = await Effect.runPromise(
      EntitySchema(counter).decode(encodedV1),
    );

    expect(decoded).toEqual({
      value: { id: 'one', count: 2, label: 'count-2' },
      meta: { _e: 'Counter', _u: '1', _d: false },
    });
    expect(decoded.value).not.toHaveProperty('_v');
    expect(decoded.meta).not.toHaveProperty('_v');
  });

  it('encodes a decoded entity at the latest version', async () => {
    const entitySchema = EntitySchema(counter);
    const decoded = await Effect.runPromise(entitySchema.decode(encodedV1));
    const encoded = await Effect.runPromise(entitySchema.encode(decoded));

    expect(encoded).toEqual({
      value: { _v: 'v2', id: 'one', count: '2', label: 'count-2' },
      meta: { _e: 'Counter', _u: '1', _d: false },
    });
  });

  it('works as an Effect Schema codec for transport integrations', async () => {
    const entitySchema = EntitySchema(counter);
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(entitySchema)(encodedV1),
    );
    const encoded = await Effect.runPromise(
      Schema.encodeEffect(entitySchema)(decoded),
    );

    expect(decoded.value.count).toBe(2);
    expect(encoded.value._v).toBe('v2');
    expect(encoded.value.count).toBe('2');
  });

  it('does not guess that a decoded entity is encoded', async () => {
    const result = await Effect.runPromise(
      EntitySchema(counter)
        .decode({
          value: { id: 'one', count: 2, label: 'count-2' },
          meta: { _e: 'Counter', _u: '1', _d: false },
        })
        .pipe(Effect.result),
    );

    expect(result._tag).toBe('Failure');
  });

  it('rejects a version stamp in decoded Entity Meta', async () => {
    const result = await Effect.runPromise(
      EntitySchema(counter)
        .encode({
          value: { id: 'one', count: 2, label: 'count-2' },
          meta: {
            _e: 'Counter',
            _u: '1',
            _d: false,
            _v: 'v1',
          } as never,
        })
        .pipe(Effect.result),
    );

    expect(result._tag).toBe('Failure');
  });
});
