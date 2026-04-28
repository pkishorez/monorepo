import { describe, it, expect } from 'vitest';
import { Effect, Schema } from 'effect';
import {
  ESchema,
  SingleEntityESchema,
  EntityESchema,
  type ESchemaEncoded,
  type ESchemaType,
} from '../index.js';
import { StringToNumber, StringToBoolean } from './fixtures.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

// ─── Multi-step evolution with field transformations ────────────────────────

describe('multi-step evolution with transforms', () => {
  const schema = ESchema.make({
    count: StringToNumber,
  })
    .evolve('v2', { active: StringToBoolean }, (v) => ({
      ...v,
      active: true,
    }))
    .evolve('v3', { label: Schema.String }, (v) => ({
      ...v,
      label: 'default',
    }))
    .build();

  itEffect('decodes v1 raw data through full migration chain', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v1', count: '10' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ count: 10, active: true, label: 'default' });
    }),
  );

  itEffect('decodes v2 raw data through partial migration', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v2', count: '5', active: 'false' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ count: 5, active: false, label: 'default' });
    }),
  );

  itEffect('decodes v3 raw data without migration', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v3', count: '7', active: 'true', label: 'hello' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ count: 7, active: true, label: 'hello' });
    }),
  );

  itEffect('encodes at v3 applying all field transforms', () =>
    Effect.gen(function* () {
      const encoded = yield* schema.encode({
        count: 42,
        active: false,
        label: 'test',
      });
      expect(encoded).toEqual({
        _v: 'v3',
        count: '42',
        active: 'false',
        label: 'test',
      });
    }),
  );

  itEffect('migration functions receive decoded types', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v1', count: '99' };
      const decoded = yield* schema.decode(raw);
      expect(decoded.count).toBe(99);
      expect(typeof decoded.count).toBe('number');
      expect(decoded.active).toBe(true);
      expect(typeof decoded.active).toBe('boolean');
    }),
  );
});

// ─── Evolution removes a transformed field ─────────────────────────────────

describe('evolution removes transformed field', () => {
  const schema = ESchema.make({
    count: StringToNumber,
    name: Schema.String,
  })
    .evolve('v2', { count: null }, (v) => {
      const { count: _, ...rest } = v;
      return rest;
    })
    .build();

  itEffect('v1 decode applies migration removing transformed field', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v1', count: '42', name: 'Alice' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ name: 'Alice' });
      expect('count' in decoded).toBe(false);
    }),
  );

  itEffect('v2 encode does not include removed field', () =>
    Effect.gen(function* () {
      const encoded = yield* schema.encode({ name: 'Bob' });
      expect(encoded).toEqual({ _v: 'v2', name: 'Bob' });
      expect('count' in encoded).toBe(false);
    }),
  );

  itEffect('v2 decode of latest version data works', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v2', name: 'Charlie' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ name: 'Charlie' });
    }),
  );
});

// ─── Migrations handle transformed values ──────────────────────────────────

describe('migrations handle transformed values', () => {
  itEffect('migration computes new field from decoded transform value', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({
        score: StringToNumber,
      })
        .evolve('v2', { doubled: Schema.Number }, (v) => ({
          ...v,
          doubled: v.score * 2,
        }))
        .build();

      const raw = { _v: 'v1', score: '15' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ score: 15, doubled: 30 });
    }),
  );

  itEffect('migration derives boolean from number transform', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({
        count: StringToNumber,
      })
        .evolve('v2', { hasItems: Schema.Boolean }, (v) => ({
          ...v,
          hasItems: v.count > 0,
        }))
        .build();

      const raw = { _v: 'v1', count: '0' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ count: 0, hasItems: false });

      const raw2 = { _v: 'v1', count: '5' };
      const decoded2 = yield* schema.decode(raw2);
      expect(decoded2).toEqual({ count: 5, hasItems: true });
    }),
  );
});

// ─── Encode after multiple evolutions ──────────────────────────────────────

describe('encode after multiple evolutions', () => {
  const schema = EntityESchema.make('Test', 'id', {
    a: Schema.String,
  })
    .evolve('v2', { count: StringToNumber }, (v) => ({ ...v, count: 0 }))
    .evolve('v3', { active: StringToBoolean }, (v) => ({
      ...v,
      active: true,
    }))
    .build();

  itEffect('encode always uses latest version', () =>
    Effect.gen(function* () {
      const encoded = yield* schema.encode({
        id: 't1',
        a: 'hello',
        count: 5,
        active: false,
      });
      expect(encoded._v).toBe('v3');
    }),
  );

  itEffect('field added in v2 with transform is correctly encoded', () =>
    Effect.gen(function* () {
      const encoded = yield* schema.encode({
        id: 't1',
        a: 'x',
        count: 42,
        active: true,
      });
      expect(encoded.count).toBe('42');
      expect(typeof encoded.count).toBe('string');
    }),
  );

  itEffect('field added in v3 with transform is correctly encoded', () =>
    Effect.gen(function* () {
      const encoded = yield* schema.encode({
        id: 't1',
        a: 'x',
        count: 1,
        active: false,
      });
      expect(encoded.active).toBe('false');
      expect(typeof encoded.active).toBe('string');
    }),
  );
});

// ─── Cross-version roundtrip ───────────────────────────────────────────────

describe('cross-version roundtrip', () => {
  const schema = ESchema.make({
    count: StringToNumber,
    name: Schema.String,
  })
    .evolve('v2', { active: StringToBoolean }, (v) => ({
      ...v,
      active: true,
    }))
    .evolve('v3', { tag: Schema.String }, (v) => ({ ...v, tag: 'none' }))
    .build();

  itEffect('v1 raw -> decode -> encode -> decode = same decoded', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v1', count: '7', name: 'Alice' };
      const decoded1 = yield* schema.decode(raw);
      const encoded = yield* schema.encode(decoded1);
      const decoded2 = yield* schema.decode(encoded);
      expect(decoded2).toEqual(decoded1);
    }),
  );

  itEffect('v2 raw -> decode -> encode -> decode = same decoded', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v2', count: '3', name: 'Bob', active: 'false' };
      const decoded1 = yield* schema.decode(raw);
      const encoded = yield* schema.encode(decoded1);
      const decoded2 = yield* schema.decode(encoded);
      expect(decoded2).toEqual(decoded1);
    }),
  );

  itEffect('v3 raw -> decode -> encode -> decode = same decoded', () =>
    Effect.gen(function* () {
      const raw = {
        _v: 'v3',
        count: '100',
        name: 'Eve',
        active: 'true',
        tag: 'important',
      };
      const decoded1 = yield* schema.decode(raw);
      const encoded = yield* schema.encode(decoded1);
      const decoded2 = yield* schema.decode(encoded);
      expect(decoded2).toEqual(decoded1);
    }),
  );

  itEffect('encoded output always has latest version', () =>
    Effect.gen(function* () {
      const raw = { _v: 'v1', count: '1', name: 'test' };
      const decoded = yield* schema.decode(raw);
      const encoded = yield* schema.encode(decoded);
      expect(encoded._v).toBe('v3');
    }),
  );
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe('edge cases', () => {
  describe('single-field schema', () => {
    const schema = ESchema.make({ value: StringToNumber }).build();

    itEffect('encode and decode single field', () =>
      Effect.gen(function* () {
        const encoded = yield* schema.encode({ value: 42 });
        expect(encoded).toEqual({ _v: 'v1', value: '42' });

        const decoded = yield* schema.decode(encoded);
        expect(decoded).toEqual({ value: 42 });
      }),
    );

    itEffect('evolve single field schema', () =>
      Effect.gen(function* () {
        const evolved = ESchema.make({ value: StringToNumber })
          .evolve('v2', { extra: Schema.String }, (v) => ({
            ...v,
            extra: 'added',
          }))
          .build();

        const raw = { _v: 'v1', value: '10' };
        const decoded = yield* evolved.decode(raw);
        expect(decoded).toEqual({ value: 10, extra: 'added' });
      }),
    );
  });

  describe('all fields are transforms', () => {
    const schema = ESchema.make({
      count: StringToNumber,
      active: StringToBoolean,
    }).build();

    itEffect('encode transforms all fields', () =>
      Effect.gen(function* () {
        const encoded = yield* schema.encode({ count: 5, active: true });
        expect(encoded).toEqual({ _v: 'v1', count: '5', active: 'true' });
      }),
    );

    itEffect('decode reverses all transforms', () =>
      Effect.gen(function* () {
        const raw = { _v: 'v1', count: '5', active: 'true' };
        const decoded = yield* schema.decode(raw);
        expect(decoded).toEqual({ count: 5, active: true });
      }),
    );
  });

  describe('optional fields with transforms', () => {
    const schema = ESchema.make({
      name: Schema.String,
      score: Schema.optionalWith(StringToNumber, { default: () => 0 }),
    }).build();

    itEffect('encode with optional present', () =>
      Effect.gen(function* () {
        const encoded = yield* schema.encode({ name: 'test', score: 10 });
        expect(encoded.name).toBe('test');
      }),
    );

    itEffect('decode with optional absent uses default', () =>
      Effect.gen(function* () {
        const raw = { _v: 'v1', name: 'test' };
        const decoded = yield* schema.decode(raw);
        expect(decoded.name).toBe('test');
        expect(decoded.score).toBe(0);
      }),
    );
  });

  describe('nullable fields', () => {
    const schema = ESchema.make({
      name: Schema.String,
      label: Schema.NullOr(Schema.String),
    }).build();

    itEffect('encode with null value', () =>
      Effect.gen(function* () {
        const encoded = yield* schema.encode({ name: 'test', label: null });
        expect(encoded).toEqual({ _v: 'v1', name: 'test', label: null });
      }),
    );

    itEffect('encode with present value', () =>
      Effect.gen(function* () {
        const encoded = yield* schema.encode({
          name: 'test',
          label: 'hello',
        });
        expect(encoded).toEqual({ _v: 'v1', name: 'test', label: 'hello' });
      }),
    );

    itEffect('decode null roundtrip', () =>
      Effect.gen(function* () {
        const raw = { _v: 'v1', name: 'test', label: null };
        const decoded = yield* schema.decode(raw);
        expect(decoded).toEqual({ name: 'test', label: null });
      }),
    );
  });
});

// ─── Error cases ───────────────────────────────────────────────────────────

describe('error cases', () => {
  itEffect('encode fails on wrong type for field', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ name: Schema.String }).build();
      const result = yield* schema
        .encode({ name: 123 } as any)
        .pipe(Effect.flip);
      expect(result.message).toBe('Encode failed');
    }),
  );

  itEffect('decode fails on malformed data', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ count: Schema.Number }).build();
      const result = yield* schema
        .decode({ _v: 'v1', count: 'not-a-number' })
        .pipe(Effect.flip);
      expect(result.message).toBe('Decode failed');
    }),
  );

  itEffect('decode fails on unknown version', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ a: Schema.String }).build();
      const result = yield* schema
        .decode({ _v: 'v99', a: 'hello' })
        .pipe(Effect.flip);
      expect(result.message).toBe('Unknown schema version: v99');
    }),
  );

  itEffect('encode rejects transform type mismatch', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ count: StringToNumber }).build();
      const result = yield* schema
        .encode({ count: 'not-a-number' } as any)
        .pipe(Effect.flip);
      expect(result.message).toBe('Encode failed');
    }),
  );
});

// ─── Type-level correctness ────────────────────────────────────────────────

describe('type-level correctness', () => {
  it('ESchemaEncoded extracts distinct type from ESchemaType with transforms', () => {
    const schema = ESchema.make({ count: StringToNumber }).build();

    type Decoded = ESchemaType<typeof schema>;
    type Encoded = ESchemaEncoded<typeof schema>;

    const _d: Decoded = { count: 42 };
    const _e: Encoded = { count: '42', _v: 'v1' };

    // @ts-expect-error — Encoded count is string, not number
    const _bad: Encoded = { count: 42, _v: 'v1' };

    expect(_d.count).toBe(42);
    expect(_e.count).toBe('42');
    void _bad;
  });

  it('ESchemaEncoded includes _v as version literal', () => {
    const schema = ESchema.make({ a: Schema.String })
      .evolve('v2', { b: Schema.Number }, (v) => ({ ...v, b: 0 }))
      .build();

    type Enc = ESchemaEncoded<typeof schema>;
    const _e: Enc = { a: 'hello', b: 0, _v: 'v2' };

    // @ts-expect-error — _v must be 'v2', not 'v1'
    const _bad: Enc = { a: 'hello', b: 0, _v: 'v1' };

    expect(_e._v).toBe('v2');
    void _bad;
  });

  it('encode input accepts decoded type', () => {
    const schema = ESchema.make({ count: StringToNumber }).build();
    const _valid = schema.encode({ count: 42 });

    // @ts-expect-error — encode input should NOT accept encoded form (string)
    const _invalid = schema.encode({ count: '42' });

    void _valid;
    void _invalid;
  });

  it('schema.Encoded phantom type matches ESchemaEncoded', () => {
    const schema = ESchema.make({
      count: StringToNumber,
      name: Schema.String,
    }).build();

    type FromPhantom = typeof schema.Encoded;
    type FromExtractor = ESchemaEncoded<typeof schema>;

    const _a: FromPhantom = { count: '42', name: 'test', _v: 'v1' };
    const _b: FromExtractor = _a;

    expect(_a).toEqual(_b);
  });
});

// ─── SingleEntityESchema evolution ─────────────────────────────────────────

describe('SingleEntityESchema evolution', () => {
  itEffect('preserves name through evolutions', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Config', {
        theme: Schema.String,
      })
        .evolve('v2', { fontSize: Schema.Number }, (v) => ({
          ...v,
          fontSize: 14,
        }))
        .build();

      expect(schema.name).toBe('Config');

      const decoded = yield* schema.decode({
        _v: 'v1',
        theme: 'dark',
      });
      expect(decoded).toEqual({ theme: 'dark', fontSize: 14 });
    }),
  );

  itEffect('multi-step evolution with transforms', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Settings', {
        maxRetries: StringToNumber,
      })
        .evolve('v2', { enabled: StringToBoolean }, (v) => ({
          ...v,
          enabled: true,
        }))
        .build();

      const raw = { _v: 'v1', maxRetries: '3' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ maxRetries: 3, enabled: true });

      const encoded = yield* schema.encode(decoded);
      expect(encoded).toEqual({
        _v: 'v2',
        maxRetries: '3',
        enabled: 'true',
      });
    }),
  );

  itEffect('field removal in SingleEntityESchema', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Prefs', {
        old: Schema.String,
        keep: Schema.String,
      })
        .evolve('v2', { old: null }, (v) => {
          const { old: _, ...rest } = v;
          return rest;
        })
        .build();

      const raw = { _v: 'v1', old: 'gone', keep: 'stays' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ keep: 'stays' });
    }),
  );
});

// ─── Evolution ↔ transform interactions ────────────────────────────────────

describe('evolution and transform interaction', () => {
  itEffect(
    'adding transform field in v2: migration provides decoded value',
    () =>
      Effect.gen(function* () {
        const schema = ESchema.make({
          name: Schema.String,
        })
          .evolve('v2', { score: StringToNumber }, (v) => ({
            ...v,
            score: 0,
          }))
          .build();

        const raw = { _v: 'v1', name: 'Alice' };
        const decoded = yield* schema.decode(raw);
        expect(decoded).toEqual({ name: 'Alice', score: 0 });
        expect(typeof decoded.score).toBe('number');

        const encoded = yield* schema.encode(decoded);
        expect(encoded.score).toBe('0');
        expect(typeof encoded.score).toBe('string');
      }),
  );

  itEffect('replacing plain field with transform field', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({
        value: Schema.String,
      })
        .evolve('v2', { value: null, count: StringToNumber }, (v) => ({
          count: parseInt(v.value) || 0,
        }))
        .build();

      const raw = { _v: 'v1', value: '42' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ count: 42 });

      const encoded = yield* schema.encode(decoded);
      expect(encoded).toEqual({ _v: 'v2', count: '42' });
    }),
  );

  itEffect('replacing transform field with plain field', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({
        count: StringToNumber,
      })
        .evolve('v2', { count: null, label: Schema.String }, (v) => ({
          label: `count-${v.count}`,
        }))
        .build();

      const raw = { _v: 'v1', count: '7' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({ label: 'count-7' });

      const encoded = yield* schema.encode(decoded);
      expect(encoded).toEqual({ _v: 'v2', label: 'count-7' });
    }),
  );

  itEffect('transform field unchanged across evolution', () =>
    Effect.gen(function* () {
      const schema = ESchema.make({
        count: StringToNumber,
      })
        .evolve('v2', { extra: Schema.String }, (v) => ({
          ...v,
          extra: 'new',
        }))
        .build();

      const raw = { _v: 'v1', count: '99' };
      const decoded = yield* schema.decode(raw);
      expect(decoded.count).toBe(99);

      const encoded = yield* schema.encode(decoded);
      expect(encoded.count).toBe('99');
      expect(encoded.extra).toBe('new');
    }),
  );

  itEffect('multiple transforms added across versions', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('Item', 'id', {
        price: StringToNumber,
      })
        .evolve('v2', { quantity: StringToNumber }, (v) => ({
          ...v,
          quantity: 1,
        }))
        .evolve('v3', { inStock: StringToBoolean }, (v) => ({
          ...v,
          inStock: v.quantity > 0,
        }))
        .build();

      const raw = { _v: 'v1', id: 'i1', price: '999' };
      const decoded = yield* schema.decode(raw);
      expect(decoded).toEqual({
        id: 'i1',
        price: 999,
        quantity: 1,
        inStock: true,
      });

      const encoded = yield* schema.encode(decoded);
      expect(encoded).toEqual({
        _v: 'v3',
        id: 'i1',
        price: '999',
        quantity: '1',
        inStock: 'true',
      });
    }),
  );
});
