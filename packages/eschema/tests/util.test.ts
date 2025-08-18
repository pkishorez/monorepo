import type { Evolution } from '../src/types.js';
import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  evolution,
  evolutionsToObject,
  extractVersion,
  resolveValue,
} from '../src/util.js';

describe('util functions', () => {
  describe('resolveValue', () => {
    it('should return direct values as-is', () => {
      expect(resolveValue(42)).toBe(42);
      expect(resolveValue('hello')).toBe('hello');
      expect(resolveValue({ foo: 'bar' })).toEqual({ foo: 'bar' });
    });

    it('should call functions without parameters', () => {
      expect(resolveValue(() => 42)).toBe(42);
      expect(resolveValue(() => 'hello')).toBe('hello');
    });

    it('should call functions with parameters', () => {
      expect(resolveValue((x: number) => x * 2, 5)).toBe(10);
      expect(
        resolveValue((a: string, b: string) => a + b, 'hello', ' world'),
      ).toBe('hello world');
    });

    it('should work with schema-like objects and parameters', () => {
      const mockSchemas = {
        v1: { _tag: 'StringSchema' },
        v2: { _tag: 'NumberSchema' },
      };
      const result = resolveValue(
        (schemas: typeof mockSchemas) => schemas.v1,
        mockSchemas,
      );
      expect(result).toEqual({ _tag: 'StringSchema' });
    });

    it('should enforce correct parameter types', () => {
      // This function expects a number parameter
      const multiplyBy2 = (x: number) => x * 2;

      // This should work fine
      expect(resolveValue(multiplyBy2, 5)).toBe(10);

      // The following would cause TypeScript errors (commented out):
      // resolveValue(multiplyBy2, 'string'); // Error: string not assignable to number
      // resolveValue(multiplyBy2); // Error: missing required parameter
      // resolveValue(multiplyBy2, 1, 2); // Error: too many parameters
    });
  });
  describe('evolutionsToObject', () => {
    it('should transform evolution array to version-schema object', () => {
      const mockSchema1 = { _tag: 'StringSchema' } as any;
      const mockSchema2 = { _tag: 'NumberSchema' } as any;

      const evolutions: Evolution<'v1' | 'v2', any>[] = [
        { version: 'v1', evolution: mockSchema1, migration: () => 'test' },
        { version: 'v2', evolution: mockSchema2, migration: () => 42 },
      ];

      const result = evolutionsToObject(evolutions);

      expect(result).toEqual({
        v1: mockSchema1,
        v2: mockSchema2,
      });
    });

    it('should handle single evolution', () => {
      const mockSchema = { _tag: 'BooleanSchema' } as any;

      const evolutions: Evolution<'v1', any>[] = [
        { version: 'v1', evolution: mockSchema, migration: () => true },
      ];

      const result = evolutionsToObject(evolutions);

      expect(result).toEqual({
        v1: mockSchema,
      });
    });
  });

  describe('evolution', () => {
    it('should add __v metadata field to schema', () => {
      const mockSchema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      });

      const originalEvolution: Evolution<'v1', typeof mockSchema> = {
        version: 'v1',
        evolution: mockSchema,
        migration: (value) => value,
      };

      const enhancedEvolution = evolution(originalEvolution);

      expect(enhancedEvolution.version).toBe('v1');
      expect(enhancedEvolution.migration).toBe(originalEvolution.migration);

      // Test that the enhanced schema includes the __v field
      const testData = { name: 'John', age: 30, __v: 'v1' as const };
      const decoded = Schema.decodeUnknownSync(enhancedEvolution.evolution)(
        testData,
      );
      expect(decoded).toEqual({
        name: 'John',
        age: 30,
        __v: 'v1',
      });
    });

    it('should preserve original schema functionality', () => {
      const userSchema = Schema.Struct({
        email: Schema.String,
      });

      const originalEvolution: Evolution<'v2', typeof userSchema> = {
        version: 'v2',
        evolution: userSchema,
        migration: (value) => value,
      };

      const enhancedEvolution = evolution(originalEvolution);

      // Should be able to decode data with both original fields and __v
      const testData = { email: 'test@example.com', __v: 'v2' as const };
      const decoded = Schema.decodeUnknownSync(enhancedEvolution.evolution)(
        testData,
      );

      expect(decoded.email).toBe('test@example.com');
      expect(decoded.__v).toBe('v2');
    });

    it('should enforce correct version literal in __v field', () => {
      const simpleSchema = Schema.Struct({
        value: Schema.String,
      });

      const originalEvolution: Evolution<'v3', typeof simpleSchema> = {
        version: 'v3',
        evolution: simpleSchema,
        migration: (value) => value,
      };

      const enhancedEvolution = evolution(originalEvolution);

      // Should succeed with correct version
      const validData = { value: 'test', __v: 'v3' as const };
      expect(() =>
        Schema.decodeUnknownSync(enhancedEvolution.evolution)(validData),
      ).not.toThrow();

      // Should fail with incorrect version
      const invalidData = { value: 'test', __v: 'v4' };
      expect(() =>
        Schema.decodeUnknownSync(enhancedEvolution.evolution)(invalidData),
      ).toThrow();
    });

    it('should work with empty schemas', () => {
      const emptySchema = Schema.Struct({});

      const originalEvolution: Evolution<'v1', typeof emptySchema> = {
        version: 'v1',
        evolution: emptySchema,
        migration: (value) => value,
      };

      const enhancedEvolution = evolution(originalEvolution);

      const testData = { __v: 'v1' as const };
      const decoded = Schema.decodeUnknownSync(enhancedEvolution.evolution)(
        testData,
      );

      expect(decoded).toEqual({ __v: 'v1' });
    });
  });

  describe('extractVersion', () => {
    it('should extract valid version from data', () => {
      const evolutions: Evolution<'v1' | 'v2', any>[] = [
        { version: 'v1', evolution: Schema.String, migration: (v) => v },
        { version: 'v2', evolution: Schema.Number, migration: (v) => v },
      ];

      const data = { name: 'John', __v: 'v1' };
      const version = Effect.runSync(extractVersion(data, evolutions));

      expect(version).toBe('v1');
    });

    it('should throw error when version field is missing', () => {
      const evolutions: Evolution<'v1', any>[] = [
        { version: 'v1', evolution: Schema.String, migration: (v) => v },
      ];

      const dataWithoutVersion = { name: 'John' };

      const result = Effect.runSyncExit(
        extractVersion(dataWithoutVersion, evolutions),
      );
      expect(Exit.isFailure(result)).toBe(true);
    });

    it('should throw error when version is not a string', () => {
      const evolutions: Evolution<'v1', any>[] = [
        { version: 'v1', evolution: Schema.String, migration: (v) => v },
      ];

      const dataWithInvalidVersion = { name: 'John', __v: 123 };

      const result = Effect.runSyncExit(
        extractVersion(dataWithInvalidVersion, evolutions),
      );
      expect(Exit.isFailure(result)).toBe(true);
    });

    it('should throw error when version is unknown', () => {
      const evolutions: Evolution<'v1', any>[] = [
        { version: 'v1', evolution: Schema.String, migration: (v) => v },
      ];

      const dataWithUnknownVersion = { name: 'John', __v: 'v99' };

      const result = Effect.runSyncExit(
        extractVersion(dataWithUnknownVersion, evolutions),
      );
      expect(Exit.isFailure(result)).toBe(true);
    });

    it('should throw error when data is not an object', () => {
      const evolutions: Evolution<'v1', any>[] = [
        { version: 'v1', evolution: Schema.String, migration: (v) => v },
      ];

      const result1 = Effect.runSyncExit(
        extractVersion('not an object', evolutions),
      );
      expect(Exit.isFailure(result1)).toBe(true);

      const result2 = Effect.runSyncExit(extractVersion(null, evolutions));
      expect(Exit.isFailure(result2)).toBe(true);
    });

    it('should work with multiple versions', () => {
      const evolutions: Evolution<'v1' | 'v2' | 'v3', any>[] = [
        { version: 'v1', evolution: Schema.String, migration: (v) => v },
        { version: 'v2', evolution: Schema.Number, migration: (v) => v },
        { version: 'v3', evolution: Schema.Boolean, migration: (v) => v },
      ];

      expect(
        Effect.runSync(extractVersion({ data: 'test', __v: 'v1' }, evolutions)),
      ).toBe('v1');
      expect(
        Effect.runSync(extractVersion({ data: 123, __v: 'v2' }, evolutions)),
      ).toBe('v2');
      expect(
        Effect.runSync(extractVersion({ data: true, __v: 'v3' }, evolutions)),
      ).toBe('v3');
    });
  });
});
