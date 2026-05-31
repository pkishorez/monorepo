import { describe, it, expect } from 'vitest';
import { Effect, Schema } from 'effect';
import {
  ESchema,
  ValueESchema,
  toSchema,
  type AnyESchema,
  type AnyEvolvingSchema,
  type AnyValueESchema,
  type ESchemaEncoded,
  type ESchemaType,
} from '../index.js';
import { ESchemaError } from '../utils.js';
import { StringToNumber } from './fixtures.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

describe('ValueESchema.make', () => {
  itEffect('encodes values with a value envelope', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(Schema.Number).build();

      const encoded = yield* schema.encode(42);

      expect(encoded).toEqual({ _v: 'v1', value: 42 });
    }),
  );

  itEffect('decodes value envelopes', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(Schema.Number).build();

      const decoded = yield* schema.decode({ _v: 'v1', value: 42 });

      expect(decoded).toBe(42);
    }),
  );

  itEffect('treats bare values as earliest-version data', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(Schema.String)
        .evolve('v2', Schema.Number, (value) => Number(value))
        .build();

      const decoded = yield* schema.decode('42');

      expect(decoded).toBe(42);
    }),
  );

  itEffect('fails on unknown envelope version', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(Schema.String).build();

      const error = yield* Effect.flip(
        schema.decode({ _v: 'v99', value: 'hello' }),
      );

      expect(error).toBeInstanceOf(ESchemaError);
      expect(error.message).toBe('Unknown schema version: v99');
    }),
  );

  itEffect('does not treat { value } as an unstamped envelope', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(Schema.String).build();

      const error = yield* Effect.flip(schema.decode({ value: 'hello' }));

      expect(error.message).toBe('Decode failed');
    }),
  );

  itEffect('treats envelope-shaped objects as envelopes', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(
        Schema.Struct({
          _v: Schema.String,
          value: Schema.String,
        }),
      ).build();

      const error = yield* Effect.flip(
        schema.decode({ _v: 'business-version', value: 'hello' }),
      );

      expect(error.message).toBe('Unknown schema version: business-version');
    }),
  );

  itEffect('allows underscore-prefixed keys inside enveloped values', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(
        Schema.Struct({
          _source: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const decoded = yield* schema.decode({
        _v: 'v1',
        value: { _source: 'import', name: 'Alice' },
      });
      const encoded = yield* schema.encode(decoded);

      expect(decoded).toEqual({ _source: 'import', name: 'Alice' });
      expect(encoded).toEqual({
        _v: 'v1',
        value: { _source: 'import', name: 'Alice' },
      });
    }),
  );
});

describe('ValueESchema.evolve', () => {
  itEffect('migrates through whole-value schema replacements', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(Schema.Literal('draft', 'published'))
        .evolve(
          'v2',
          Schema.Literal('draft', 'review', 'published'),
          (value) => value,
        )
        .build();

      const decoded = yield* schema.decode({ _v: 'v1', value: 'draft' });
      const encoded = yield* schema.encode('review');

      expect(decoded).toBe('draft');
      expect(encoded).toEqual({ _v: 'v2', value: 'review' });
    }),
  );

  itEffect('migrations receive decoded transformed values', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(StringToNumber)
        .evolve('v2', Schema.Number, (value) => value * 2)
        .build();

      const decoded = yield* schema.decode({ _v: 'v1', value: '21' });

      expect(decoded).toBe(42);
    }),
  );
});

describe('ValueESchema transforms', () => {
  itEffect('applies value transforms on encode and decode', () =>
    Effect.gen(function* () {
      const schema = ValueESchema.make(StringToNumber).build();

      const encoded = yield* schema.encode(42);
      const decoded = yield* schema.decode(encoded);

      expect(encoded).toEqual({ _v: 'v1', value: '42' });
      expect(decoded).toBe(42);
    }),
  );
});

describe('ValueESchema composition', () => {
  const Status = ValueESchema.make(Schema.Literal('draft', 'published'))
    .evolve(
      'v2',
      Schema.Literal('draft', 'review', 'published'),
      (value) => value,
    )
    .build();

  const Ticket = ESchema.make({
    title: Schema.String,
    status: toSchema(Status),
  }).build();

  itEffect('encodes nested values as envelopes', () =>
    Effect.gen(function* () {
      const encoded = yield* Ticket.encode({
        title: 'Fix billing',
        status: 'review',
      });

      expect(encoded).toEqual({
        _v: 'v1',
        title: 'Fix billing',
        status: { _v: 'v2', value: 'review' },
      });
    }),
  );

  itEffect('decodes nested bare legacy values', () =>
    Effect.gen(function* () {
      const decoded = yield* Ticket.decode({
        _v: 'v1',
        title: 'Fix billing',
        status: 'draft',
      });

      expect(decoded).toEqual({
        title: 'Fix billing',
        status: 'draft',
      });
    }),
  );

  itEffect('decodes nested value envelopes independently', () =>
    Effect.gen(function* () {
      const decoded = yield* Ticket.decode({
        _v: 'v1',
        title: 'Fix billing',
        status: { _v: 'v1', value: 'published' },
      });

      expect(decoded).toEqual({
        title: 'Fix billing',
        status: 'published',
      });
    }),
  );
});

describe('ValueESchema views', () => {
  it('schema exposes the latest value schema', () => {
    const schema = ValueESchema.make(Schema.String)
      .evolve('v2', Schema.Number, (value) => Number(value))
      .build();

    expect(Schema.isSchema(schema.schema)).toBe(true);
  });

  it('getDescriptor describes the canonical envelope', () => {
    const schema = ValueESchema.make(StringToNumber).build();

    const descriptor = schema.getDescriptor();
    const versionSchema = descriptor.properties._v as { enum?: string[] };
    const valueSchema = descriptor.properties.value as { type?: string };

    expect(descriptor.type).toBe('object');
    expect(versionSchema.enum).toEqual(['v1']);
    expect(valueSchema.type).toBe('string');
  });

  it('Standard Schema validate follows the read path', () => {
    const schema = ValueESchema.make(Schema.String).build();

    expect(schema['~standard'].validate('draft')).toEqual({ value: 'draft' });
    expect(schema['~standard'].validate({ _v: 'v1', value: 'draft' })).toEqual({
      value: 'draft',
    });
  });
});

describe('ValueESchema type extractors', () => {
  it('extracts decoded and encoded value types', () => {
    const schema = ValueESchema.make(StringToNumber).build();

    type Decoded = ESchemaType<typeof schema>;
    type Encoded = ESchemaEncoded<typeof schema>;

    const decoded: Decoded = 42;
    const encoded: Encoded = { _v: 'v1', value: '42' };

    // @ts-expect-error — encoded value uses the schema encoded type
    const invalidEncoded: Encoded = { _v: 'v1', value: 42 };

    expect(decoded).toBe(42);
    expect(encoded).toEqual({ _v: 'v1', value: '42' });
    void invalidEncoded;
  });

  it('keeps value and object-shaped widening types separate', () => {
    const objectSchema = ESchema.make({ name: Schema.String }).build();
    const valueSchema = ValueESchema.make(Schema.String).build();

    function acceptsAnyESchema(schema: AnyESchema) {
      return schema.getDescriptor();
    }

    function acceptsValueSchema(schema: AnyValueESchema) {
      return schema.getDescriptor();
    }

    function acceptsEvolvingSchema(schema: AnyEvolvingSchema) {
      return schema.getDescriptor();
    }

    const objectDescriptor = acceptsAnyESchema(objectSchema);
    const valueDescriptor = acceptsValueSchema(valueSchema);
    const anyObjectDescriptor = acceptsEvolvingSchema(objectSchema);
    const anyValueDescriptor = acceptsEvolvingSchema(valueSchema);

    function assertTypeErrors() {
      // @ts-expect-error — AnyESchema remains object-shaped
      acceptsAnyESchema(valueSchema);

      // @ts-expect-error — ValueESchema has no fields API
      const fields = valueSchema.fields;

      // @ts-expect-error — ValueESchema has no partial field-map helper
      valueSchema.makePartial({});

      void fields;
    }

    void assertTypeErrors;

    expect(objectDescriptor.type).toBe('object');
    expect(valueDescriptor.type).toBe('object');
    expect(anyObjectDescriptor.type).toBe('object');
    expect(anyValueDescriptor.type).toBe('object');
  });
});
