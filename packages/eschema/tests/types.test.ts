import type { Schema } from 'effect';
import type {
  EnsureUniqueVersion,
  Evolution,
  EvolutionsToObject,
  ExtractUnion,
  ExtractVersions,
  LatestSchemaType,
  ResolveType,
} from '../src/types.js';
import { identity } from 'effect';
import { describe, expectTypeOf, it } from 'vitest';

describe('type-level tests', () => {
  describe('resolveType', () => {
    it('should return function return type for functions', () => {
      expectTypeOf<ResolveType<() => string>>().toEqualTypeOf<string>();
      expectTypeOf<ResolveType<() => number>>().toEqualTypeOf<number>();
      expectTypeOf<
        ResolveType<(x: number) => string>
      >().toEqualTypeOf<string>();
    });

    it('should return the type itself for non-functions', () => {
      expectTypeOf<ResolveType<string>>().toEqualTypeOf<string>();
      expectTypeOf<ResolveType<number>>().toEqualTypeOf<number>();
    });
  });
  describe('evolution', () => {
    it('should properly type version and schema', () => {
      type TestEvolution = Evolution<'v1', Schema.Schema<string>>;
      const evolution: TestEvolution = {
        version: 'v1',
        schema: {} as Schema.Schema<string>,
        migration: identity,
      };

      expectTypeOf(evolution.version).toEqualTypeOf<'v1'>();
      expectTypeOf(evolution.schema).toEqualTypeOf<Schema.Schema<string>>();
    });
  });

  describe('latestSchemaType', () => {
    it('should extract latest schema from evolution array', () => {
      type Evolutions = [
        Evolution<'v1', Schema.Schema<string>>,
        Evolution<'v2', Schema.Schema<number>>,
      ];

      expectTypeOf<LatestSchemaType<Evolutions>>().toEqualTypeOf<
        Schema.Schema<number>
      >();
    });

    it('should return never for empty array', () => {
      expectTypeOf<LatestSchemaType<[]>>().toEqualTypeOf<never>();
    });
  });

  describe('extractUnion', () => {
    it('should extract property union from object array', () => {
      type Objects = [
        { version: 'v1'; data: string },
        { version: 'v2'; data: number },
      ];

      expectTypeOf<ExtractUnion<Objects, 'version'>>().toEqualTypeOf<
        'v1' | 'v2'
      >();
      expectTypeOf<ExtractUnion<Objects, 'data'>>().toEqualTypeOf<
        string | number
      >();
    });

    it('should work with single element array', () => {
      type SingleObject = [{ version: 'v1'; data: string }];

      expectTypeOf<
        ExtractUnion<SingleObject, 'version'>
      >().toEqualTypeOf<'v1'>();
    });
  });

  describe('extractVersions', () => {
    it('should extract version union from evolution array', () => {
      type Evolutions = [
        Evolution<'v1', Schema.Schema<string>>,
        Evolution<'v2', Schema.Schema<number>>,
      ];

      expectTypeOf<ExtractVersions<Evolutions>>().toEqualTypeOf<'v1' | 'v2'>();
    });

    it('should handle single evolution version', () => {
      type SingleEvolution = [Evolution<'v1', Schema.Schema<string>>];

      expectTypeOf<ExtractVersions<SingleEvolution>>().toEqualTypeOf<'v1'>();
    });
  });

  describe('ensureUniqueVersion', () => {
    it('should allow unique versions', () => {
      type Evolutions = [Evolution<'v1', Schema.Schema<string>>];

      expectTypeOf<
        EnsureUniqueVersion<'v2', Evolutions>
      >().toEqualTypeOf<'v2'>();
      expectTypeOf<
        EnsureUniqueVersion<'v3', Evolutions>
      >().toEqualTypeOf<'v3'>();
    });

    it('should reject duplicate versions', () => {
      type Evolutions = [
        Evolution<'v1', Schema.Schema<string>>,
        Evolution<'v2', Schema.Schema<number>>,
      ];

      expectTypeOf<
        EnsureUniqueVersion<'v1', Evolutions>
      >().toEqualTypeOf<'v1 is already part of previous versions'>();
      expectTypeOf<
        EnsureUniqueVersion<'v2', Evolutions>
      >().toEqualTypeOf<'v2 is already part of previous versions'>();
    });
  });

  describe('evolutionsToObject', () => {
    it('should transform evolution array to version-schema object', () => {
      type Evolutions = [
        Evolution<'v1', Schema.Schema<string>>,
        Evolution<'v2', Schema.Schema<number>>,
      ];

      expectTypeOf<EvolutionsToObject<Evolutions>>().toEqualTypeOf<{
        v1: Schema.Schema<string>;
        v2: Schema.Schema<number>;
      }>();
    });

    it('should handle single evolution', () => {
      type SingleEvolution = [Evolution<'v1', Schema.Schema<boolean>>];

      expectTypeOf<EvolutionsToObject<SingleEvolution>>().toEqualTypeOf<{
        v1: Schema.Schema<boolean>;
      }>();
    });
  });
});
