import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema } from '../src/eschema.js';

describe('eSchema', () => {
  describe('parse', () => {
    it('should parse data with current version (no migration needed)', () => {
      const userSchema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      });

      // Test data with v1 version
      const testData = { name: 'John', age: 30, __v: 'v1' as const };

      // ESchema automatically adds metadata to schemas
      const parser = ESchema.make('v1', userSchema).build();
      const result = Effect.runSync(parser.parse(testData));

      expect(result.value).toEqual({
        name: 'John',
        age: 30,
      });
    });

    it('should parse and migrate data from older version to latest', () => {
      // Clean schemas without metadata - ESchema will add metadata automatically
      const v1Schema = Schema.Struct({ name: Schema.String });
      const v2Schema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      });
      const v3Schema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
        email: Schema.String,
      });

      // Build parser with migrations
      const parser = ESchema.make('v1', v1Schema)
        .evolve('v2', v2Schema, (v1Data) => ({
          name: v1Data.name,
          age: 25, // Default age for migration
        }))
        .evolve('v3', v3Schema, (v2Data) => ({
          name: v2Data.name,
          age: v2Data.age,
          email: `${v2Data.name.toLowerCase()}@example.com`, // Generate email
        }))
        .build();

      // Test data with v1 version
      const v1Data = { name: 'John', __v: 'v1' as const };
      const result = Effect.runSync(parser.parse(v1Data));

      expect(result.value).toEqual({
        name: 'John',
        age: 25,
        email: 'john@example.com',
      });
    });

    it('should parse data from middle version to latest', () => {
      const v1Schema = Schema.Struct({ name: Schema.String });
      const v2Schema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      });
      const v3Schema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
        active: Schema.Boolean,
      });

      const parser = ESchema.make('v1', v1Schema)
        .evolve('v2', v2Schema, (v1Data) => ({
          name: v1Data.name,
          age: 30,
        }))
        .evolve('v3', v3Schema, (v2Data) => ({
          name: v2Data.name,
          age: v2Data.age,
          active: true,
        }))
        .build();

      // Test data with v2 version (middle version)
      const v2Data = { name: 'Jane', age: 25, __v: 'v2' as const };
      const result = Effect.runSync(parser.parse(v2Data));

      expect(result.value).toEqual({
        name: 'Jane',
        age: 25,
        active: true,
      });
    });

    it('should throw error when version field is missing', () => {
      const schema = Schema.Struct({ name: Schema.String });

      const parser = ESchema.make('v1', schema).build();
      const dataWithoutVersion = { name: 'John' };

      const result = Effect.runSyncExit(parser.parse(dataWithoutVersion));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe('Fail');
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error._tag).toBe('eschema/ParseError');
        }
      }
    });

    it('should throw error when version is not a string', () => {
      const schema = Schema.Struct({ name: Schema.String });

      const parser = ESchema.make('v1', schema).build();
      const dataWithInvalidVersion = { name: 'John', __v: 123 };

      const result = Effect.runSyncExit(parser.parse(dataWithInvalidVersion));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe('Fail');
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error._tag).toBe('eschema/ParseError');
        }
      }
    });

    it('should throw error when version is unknown', () => {
      const schema = Schema.Struct({ name: Schema.String });

      const parser = ESchema.make('v1', schema).build();
      const dataWithUnknownVersion = { name: 'John', __v: 'v99' };

      const result = Effect.runSyncExit(parser.parse(dataWithUnknownVersion));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe('Fail');
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error._tag).toBe('eschema/ParseError');
          expect(result.cause.error.msg).toContain('Unknown version "v99"');
        }
      }
    });

    it('should throw error when data is not an object', () => {
      const schema = Schema.Struct({ name: Schema.String });

      const parser = ESchema.make('v1', schema).build();

      const result1 = Effect.runSyncExit(parser.parse('not an object'));
      expect(Exit.isFailure(result1)).toBe(true);

      const result2 = Effect.runSyncExit(parser.parse(null));
      expect(Exit.isFailure(result2)).toBe(true);
    });

    it('should throw error when schema parsing fails', () => {
      const strictSchema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      });

      const parser = ESchema.make('v1', strictSchema).build();

      // Data missing required field
      const invalidData = { name: 'John', __v: 'v1' }; // Missing age

      const result = Effect.runSyncExit(parser.parse(invalidData));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe('Fail');
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error._tag).toBe('eschema/ParseError');
          expect(result.cause.error.msg).toContain(
            'Failed to parse data with version "v1"',
          );
        }
      }
    });

    it('should throw error when migration fails', () => {
      const v1Schema = Schema.Struct({ name: Schema.String });
      const v2Schema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      });

      const parser = ESchema.make('v1', v1Schema)
        .evolve('v2', v2Schema, () => {
          throw new Error('Migration intentionally failed');
        })
        .build();

      const v1Data = { name: 'John', __v: 'v1' as const };

      const result = Effect.runSyncExit(parser.parse(v1Data));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(result.cause._tag).toBe('Fail');
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error._tag).toBe('eschema/ParseError');
          expect(result.cause.error.msg).toContain(
            'Migration failed from "v1" to "v2"',
          );
        }
      }
    });
  });

  describe('make', () => {
    it('should create data with version metadata', () => {
      const userSchema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      });

      const { make } = ESchema.make('v1', userSchema).build();
      const userData = { name: 'Alice', age: 25 };
      const result = make(userData);

      expect(result).toEqual({
        name: 'Alice',
        age: 25,
        __v: 'v1',
      });
    });

    it('should validate data against schema before adding version', () => {
      const strictSchema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      });

      const { make } = ESchema.make('v1', strictSchema).build();
      const invalidData = { name: 'Bob' }; // Missing age

      expect(() => make(invalidData as any)).toThrow();
    });
  });
});
