import { readEncoded, writeEncoded } from '../domain/encoded/index.js';
import { it, describe, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Schema } from 'effect';
import { ESchema, OutdatedVersion } from '../index.js';

describe('ESchema', () => {
  describe('Plain schema', () => {
    describe('Make', () => {
      itEffect('creates a v1 schema and encodes with version', () =>
        Effect.gen(function* () {
          const schema = ESchema.make('User', {
            name: Schema.String,
          }).build();

          const encoded = yield* writeEncoded(schema, { name: 'Alice' });
          expect(encoded).toEqual({ _v: 'v1', name: 'Alice' });
        }),
      );

      itEffect('decodes v1 data', () =>
        Effect.gen(function* () {
          const schema = ESchema.make('Counter', {
            name: Schema.String,
            count: Schema.Number,
          }).build();

          const decoded = yield* readEncoded(schema, {
            _v: 'v1',
            name: 'foo',
            count: 10,
          });
          expect(decoded).toEqual({ name: 'foo', count: 10 });
        }),
      );

      itEffect('defaults to latest version when _v is missing', () =>
        Effect.gen(function* () {
          const schema = ESchema.make('Doc', { a: Schema.String }).build();

          const decoded = yield* readEncoded(schema, { a: 'hello' });
          expect(decoded).toEqual({ a: 'hello' });
        }),
      );

      itEffect('fails with OutdatedVersion on a newer version', () =>
        Effect.gen(function* () {
          const schema = ESchema.make('Doc', { a: Schema.String }).build();

          const error = yield* Effect.flip(
            readEncoded(schema, { _v: 'v99', a: 'hello' }),
          );
          expect(error).toBeInstanceOf(OutdatedVersion);
          expect(error.message).toBe('Unknown schema version: v99');
        }),
      );
    });

    describe('Evolve', () => {
      itEffect('migrates v1 → v2', () =>
        Effect.gen(function* () {
          const schema = ESchema.make('Item', { a: Schema.String })
            .evolve('v2', { b: Schema.Number }, (v) => ({ ...v, b: 42 }))
            .build();

          const decoded = yield* readEncoded(schema, {
            _v: 'v1',
            a: 'hello',
          });
          expect(decoded).toEqual({ a: 'hello', b: 42 });
        }),
      );

      itEffect('chains v1 → v2 → v3', () =>
        Effect.gen(function* () {
          const schema = ESchema.make('Item', { a: Schema.String })
            .evolve('v2', { b: Schema.String }, (v) => ({ ...v, b: 'added' }))
            .evolve('v3', { c: Schema.Number }, (v) => ({ ...v, c: 0 }))
            .build();

          const fromV1 = yield* readEncoded(schema, { _v: 'v1', a: 'x' });
          expect(fromV1).toEqual({ a: 'x', b: 'added', c: 0 });

          const fromV2 = yield* readEncoded(schema, {
            _v: 'v2',
            a: 'x',
            b: 'y',
          });
          expect(fromV2).toEqual({ a: 'x', b: 'y', c: 0 });

          const fromV3 = yield* readEncoded(schema, {
            _v: 'v3',
            a: 'x',
            b: 'y',
            c: 9,
          });
          expect(fromV3).toEqual({ a: 'x', b: 'y', c: 9 });
        }),
      );

      itEffect('handles field removal', () =>
        Effect.gen(function* () {
          const schema = ESchema.make('Item', {
            a: Schema.String,
            b: Schema.String,
          })
            .evolve('v2', { b: null }, (v) => ({ a: v.a }))
            .build();

          const decoded = yield* readEncoded(schema, {
            _v: 'v1',
            a: 'keep',
            b: 'drop',
          });
          expect(decoded).toEqual({ a: 'keep' });
        }),
      );
    });

    describe('Views', () => {
      it('fields returns the latest schema fields', () => {
        const schema = ESchema.make('Pair', {
          a: Schema.String,
          b: Schema.Number,
        }).build();
        expect(Object.keys(schema.fields).sort()).toEqual(['a', 'b']);
      });

      it('schema returns an Effect Schema.Struct', () => {
        const schema = ESchema.make('Doc', { a: Schema.String }).build();
        expect(Object.keys(schema.schema.fields)).toEqual(['a']);
      });
    });

    describe('Roundtrip', () => {
      itEffect('encode → decode preserves data', () =>
        Effect.gen(function* () {
          const schema = ESchema.make('Counter', {
            name: Schema.String,
            count: Schema.Number,
          }).build();

          const encoded = yield* writeEncoded(schema, {
            name: 'test',
            count: 42,
          });
          const decoded = yield* readEncoded(schema, encoded);
          expect(decoded).toEqual({ name: 'test', count: 42 });
        }),
      );
    });

    describe('Get descriptor', () => {
      it('returns JSON Schema with version literal', () => {
        const schema = ESchema.make('Doc', { a: Schema.String }).build();
        const descriptor = schema.getDescriptor();

        expect(descriptor.type).toBe('object');
        expect(descriptor.properties).toHaveProperty('a');
        expect(descriptor.properties).toHaveProperty('_v');
        const vSchema = descriptor.properties._v as { enum?: string[] };
        expect(vSchema.enum).toEqual(['v1']);
      });
    });

    describe('From type', () => {
      itEffect('passes unknown values through as the requested type', () =>
        Effect.gen(function* () {
          type ExternalShape = {
            readonly expression: readonly [string, readonly unknown[]];
          };

          const ExternalShapeSchema = ESchema.fromType<ExternalShape>();
          const input = { expression: ['val', ['path']] as const };

          const decoded =
            yield* Schema.decodeUnknownEffect(ExternalShapeSchema)(input);
          const encoded =
            yield* Schema.encodeEffect(ExternalShapeSchema)(decoded);

          expect(decoded.expression[0]).toBe('val');
          expect(encoded).toBe(input);
        }),
      );
    });
  });
});
