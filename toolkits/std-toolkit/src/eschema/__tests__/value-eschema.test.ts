import { readEncoded, writeEncoded } from '../domain/encoded/index.js';
import { it, describe, expect } from 'vitest';
import { Effect, Schema } from 'effect';
import {
  ESchema,
  ValueESchema,
  toSchema,
  type AnyESchema,
  type ESchemaType,
  OutdatedVersion,
} from '../index.js';
import type {
  AnyEvolvingSchema,
  AnyValueESchema,
} from '../domain/schema-model/index.js';
import { ESchemaError } from '../index.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

describe('ESchema', () => {
  describe('Value', () => {
    describe('Make', () => {
      itEffect('encodes values with a value envelope', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Count', Schema.Number).build();

          const encoded = yield* writeEncoded(schema, 42);

          expect(encoded).toEqual({ _v: 'v1', _value: 42 });
        }),
      );

      itEffect('decodes value envelopes', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Count', Schema.Number).build();

          const decoded = yield* readEncoded(schema, {
            _v: 'v1',
            _value: 42,
          });

          expect(decoded).toBe(42);
        }),
      );

      itEffect('treats bare values as earliest-version data', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Count', Schema.String)
            .evolve('v2', Schema.Number, (value) => Number(value))
            .build();

          const decoded = yield* readEncoded(schema, '42');

          expect(decoded).toBe(42);
        }),
      );

      itEffect('fails with OutdatedVersion on a newer envelope version', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Label', Schema.String).build();

          const error = yield* Effect.flip(
            readEncoded(schema, { _v: 'v99', _value: 'hello' }),
          );

          expect(error).toBeInstanceOf(OutdatedVersion);
          expect(error.message).toBe('Unknown schema version: v99');
        }),
      );

      itEffect('reads an object without _value as a bare value', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make(
            'Label',
            Schema.Struct({
              value: Schema.String,
              colour: Schema.String,
            }),
          ).build();

          const decoded = yield* readEncoded(schema, {
            value: 'urgent',
            colour: 'red',
          });

          expect(decoded).toEqual({ value: 'urgent', colour: 'red' });
        }),
      );

      itEffect('refuses an envelope with extra keys', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Label', Schema.String).build();

          const error = yield* Effect.flip(
            readEncoded(schema, { _v: 'v1', _value: 'hello', junk: 1 }),
          );

          expect(error).toBeInstanceOf(ESchemaError);
          expect(error.message).toBe(
            'Malformed value envelope: unexpected keys junk',
          );
        }),
      );

      itEffect('refuses an envelope without a version', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Label', Schema.String).build();

          const error = yield* Effect.flip(
            readEncoded(schema, { _value: 'hello' }),
          );

          expect(error).toBeInstanceOf(ESchemaError);
          expect(error.message).toBe('Malformed value envelope');
        }),
      );

      itEffect('refuses an envelope with a non-string version', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Label', Schema.String).build();

          const error = yield* Effect.flip(
            readEncoded(schema, { _v: 1, _value: 'hello' }),
          );

          expect(error).toBeInstanceOf(ESchemaError);
          expect(error.message).toBe('Malformed value envelope');
        }),
      );

      itEffect('refuses a payload that does not match its version', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Count', Schema.Number).build();

          const error = yield* Effect.flip(
            readEncoded(schema, { _v: 'v1', _value: 'not a number' }),
          );

          expect(error).toBeInstanceOf(ESchemaError);
          expect(error.message).toBe('Decode failed');
        }),
      );

      it('refuses top-level fields that start with _', () => {
        function assertTypeErrors() {
          ValueESchema.make(
            'Payload',
            // @ts-expect-error — top-level _ fields are reserved
            Schema.Struct({ _source: Schema.String, name: Schema.String }),
          );

          ValueESchema.make('Payload', Schema.String).evolve(
            'v2',
            // @ts-expect-error — the rule holds for every version
            Schema.Struct({ _v: Schema.String }),
            (value) => ({ _v: value }),
          );
        }

        expect(assertTypeErrors).toBeTypeOf('function');
      });

      itEffect('allows _ keys below the top level', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make(
            'Payload',
            Schema.Struct({
              meta: Schema.Struct({ _source: Schema.String }),
              name: Schema.String,
            }),
          ).build();

          const stored = {
            _v: 'v1',
            _value: { meta: { _source: 'import' }, name: 'Alice' },
          };
          const decoded = yield* readEncoded(schema, stored);

          expect(decoded).toEqual({
            meta: { _source: 'import' },
            name: 'Alice',
          });
          expect(yield* writeEncoded(schema, decoded)).toEqual(stored);
        }),
      );
    });

    describe('Evolve', () => {
      itEffect('migrates through whole-value schema replacements', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make(
            'Status',
            Schema.Literals(['draft', 'published']),
          )
            .evolve(
              'v2',
              Schema.Literals(['draft', 'review', 'published']),
              (value) => value,
            )
            .build();

          const decoded = yield* readEncoded(schema, {
            _v: 'v1',
            _value: 'draft',
          });
          const encoded = yield* writeEncoded(schema, 'review');

          expect(decoded).toBe('draft');
          expect(encoded).toEqual({ _v: 'v2', _value: 'review' });
        }),
      );

      itEffect('migrations receive decoded values from prior versions', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Count', Schema.Number)
            .evolve('v2', Schema.Number, (value) => value * 2)
            .build();

          const decoded = yield* readEncoded(schema, {
            _v: 'v1',
            _value: 21,
          });

          expect(decoded).toBe(42);
        }),
      );

      itEffect('turns a throwing migration into an ESchemaError', () =>
        Effect.gen(function* () {
          const schema = ValueESchema.make('Count', Schema.String)
            .evolve('v2', Schema.Number, () => {
              throw new Error('boom');
            })
            .build();

          const error = yield* Effect.flip(readEncoded(schema, '42'));

          expect(error).toBeInstanceOf(ESchemaError);
          expect(error.message).toBe('Migration to v2 failed');
        }),
      );
    });

    describe('Composition', () => {
      const Status = ValueESchema.make(
        'Status',
        Schema.Literals(['draft', 'published']),
      )
        .evolve(
          'v2',
          Schema.Literals(['draft', 'review', 'published']),
          (value) => value,
        )
        .build();

      const Ticket = ESchema.make('Ticket', {
        title: Schema.String,
        status: toSchema(Status),
      }).build();

      itEffect('encodes nested values as envelopes', () =>
        Effect.gen(function* () {
          const encoded = yield* writeEncoded(Ticket, {
            title: 'Fix billing',
            status: 'review',
          });

          expect(encoded).toEqual({
            _v: 'v1',
            title: 'Fix billing',
            status: { _v: 'v2', _value: 'review' },
          });
        }),
      );

      itEffect('decodes nested bare legacy values', () =>
        Effect.gen(function* () {
          const decoded = yield* readEncoded(Ticket, {
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
          const decoded = yield* readEncoded(Ticket, {
            _v: 'v1',
            title: 'Fix billing',
            status: { _v: 'v1', _value: 'published' },
          });

          expect(decoded).toEqual({
            title: 'Fix billing',
            status: 'published',
          });
        }),
      );
    });

    describe('Views', () => {
      it('schema exposes the latest value schema', () => {
        const schema = ValueESchema.make('Count', Schema.String)
          .evolve('v2', Schema.Number, (value) => Number(value))
          .build();

        expect(Schema.isSchema(schema.schema)).toBe(true);
      });

      it('getDescriptor describes the canonical envelope', () => {
        const schema = ValueESchema.make('Count', Schema.Number).build();

        const descriptor = schema.getDescriptor();
        const versionSchema = descriptor.properties._v as { enum?: string[] };

        expect(descriptor.type).toBe('object');
        expect(versionSchema.enum).toEqual(['v1']);
        expect(descriptor.properties).toHaveProperty('_value');
      });

      it('Standard Schema validates the migrated form', () => {
        const schema = ValueESchema.make('Label', Schema.String).build();

        expect(schema['~standard'].validate('draft')).toEqual({
          value: 'draft',
        });
        expect(
          'issues' in
            schema['~standard'].validate({ _v: 'v1', _value: 'draft' }),
        ).toBe(true);
      });
    });

    describe('Type extractors', () => {
      it('extracts decoded and encoded value types', () => {
        const schema = ValueESchema.make('Count', Schema.Number).build();

        type Decoded = ESchemaType<typeof schema>;
        type Encoded = (typeof schema)['Encoded'];

        const decoded: Decoded = 42;
        const encoded: Encoded = { _v: 'v1', _value: 42 };

        // @ts-expect-error — encoded value must carry the envelope's _v
        const invalidEncoded: Encoded = { _value: 42 };

        expect(decoded).toBe(42);
        expect(encoded).toEqual({ _v: 'v1', _value: 42 });
        void invalidEncoded;
      });

      it('keeps value and object-shaped widening types separate', () => {
        const objectSchema = ESchema.make('User', {
          name: Schema.String,
        }).build();
        const valueSchema = ValueESchema.make('Label', Schema.String).build();

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
  });
});
