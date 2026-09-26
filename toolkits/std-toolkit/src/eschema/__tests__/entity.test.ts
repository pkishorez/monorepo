import { readEncoded, writeEncoded } from '../domain/encoded/index.js';
import { it, describe, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Schema } from 'effect';
import { EntityESchema } from '../index.js';

describe('ESchema', () => {
  describe('Entity', () => {
    describe('Make', () => {
      itEffect('creates a v1 schema with name and id field', () =>
        Effect.gen(function* () {
          const schema = EntityESchema.make('User', 'id', {
            name: Schema.String,
          }).build();

          expect(schema.idField).toBe('id');
          const encoded = yield* writeEncoded(schema, {
            id: 'u1',
            name: 'Alice',
          });
          expect(encoded).toEqual({ _v: 'v1', id: 'u1', name: 'Alice' });
        }),
      );

      itEffect('supports complex field types', () =>
        Effect.gen(function* () {
          const schema = EntityESchema.make('Complex', 'id', {
            count: Schema.Number,
            tag: Schema.Literals(['a', 'b']),
            nullable: Schema.NullOr(Schema.String),
          }).build();

          const decoded = yield* readEncoded(schema, {
            _v: 'v1',
            id: 'c1',
            count: 42,
            tag: 'a',
            nullable: null,
          });
          expect(decoded).toEqual({
            id: 'c1',
            count: 42,
            tag: 'a',
            nullable: null,
          });
        }),
      );

      it('supports custom id field names', () => {
        const schema = EntityESchema.make('User', 'userId', {
          name: Schema.String,
        }).build();

        expect(schema.idField).toBe('userId');
      });
    });

    describe('Fields', () => {
      it('returns the latest schema fields including id', () => {
        const schema = EntityESchema.make('Test', 'id', {
          a: Schema.String,
        }).build();

        expect(Object.keys(schema.fields)).toEqual(['a', 'id']);
      });

      it('returns evolved schema fields after evolution', () => {
        const schema = EntityESchema.make('Test', 'id', {
          a: Schema.String,
        })
          .evolve('v2', { b: Schema.Number }, (v) => ({ ...v, b: 0 }))
          .build();

        expect(Object.keys(schema.fields).sort()).toEqual(['a', 'b', 'id']);
      });
    });

    describe('Schema', () => {
      it('returns an Effect Schema.Struct with ID field', () => {
        const eschema = EntityESchema.make('Test', 'id', {
          a: Schema.String,
        }).build();

        const effectSchema = eschema.schema;
        expect(effectSchema.fields).toBeDefined();
        expect(Object.keys(effectSchema.fields)).toEqual(['a', 'id']);
      });
    });

    describe('ForbidIdField enforcement', () => {
      it('id field is auto-added and cannot be in user schema', () => {
        const schema = EntityESchema.make('Test', 'testId', {
          name: Schema.String,
        }).build();

        expect(schema.idField).toBe('testId');
        expect(Object.keys(schema.fields)).toContain('testId');
      });
    });

    describe('ID handling', () => {
      itEffect('decoded id is a plain string', () =>
        Effect.gen(function* () {
          const userSchema = EntityESchema.make('User', 'id', {
            name: Schema.String,
          }).build();

          const decoded = yield* readEncoded(userSchema, {
            id: 'u1',
            name: 'Alice',
          });
          expect(decoded.id).toBe('u1');
        }),
      );

      itEffect('encoded id is a plain string', () =>
        Effect.gen(function* () {
          const userSchema = EntityESchema.make('User', 'id', {
            name: Schema.String,
          }).build();

          const encoded = yield* writeEncoded(userSchema, {
            id: 'u1',
            name: 'Alice',
          });
          expect(encoded.id).toBe('u1');

          const reEncoded = yield* writeEncoded(userSchema, {
            id: encoded.id,
            name: 'Bob',
          });
          expect(reEncoded.id).toBe('u1');
        }),
      );
    });
  });
});
