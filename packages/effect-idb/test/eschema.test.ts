import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema } from '../src/eschema.js';

describe('eSchema', () => {
  describe('eSchema.make()', () => {
    it('should create an initial schema builder', () => {
      const builder = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      );
      expect(builder).toBeDefined();
      expect(typeof builder.evolve).toBe('function');
      expect(typeof builder.build).toBe('function');
    });

    it('should build a simple schema without evolution', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();
      expect(schema).toBeInstanceOf(ESchema);
    });
  });

  describe('builder methods', () => {
    it('should allow chaining evolve calls', () => {
      const builder = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 0 }),
        })
        .evolve('v3', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ email: Schema.String })),
          transformValue: (old) => ({ ...old, email: 'default@example.com' }),
        });

      expect(typeof builder.evolve).toBe('function');
      expect(typeof builder.build).toBe('function');

      const schema = builder.build();
      expect(schema).toBeInstanceOf(ESchema);
    });
  });

  describe('getValue()', () => {
    it('should return data from the latest version without __v field', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();

      const input = { name: 'John', __v: 'v1' };
      const result = schema.getValue(input);

      expect(result).toEqual({ name: 'John' });
      expect(result).not.toHaveProperty('__v');
    });

    it('should migrate data from older version to latest', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const oldData = { name: 'John', __v: 'v1' };
      const result = schema.getValue(oldData);

      expect(result).toEqual({ name: 'John', age: 25 });
      expect(result).not.toHaveProperty('__v');
    });

    it('should handle multiple migrations', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .evolve('v3', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ email: Schema.String })),
          transformValue: (old) => ({ ...old, email: 'john@example.com' }),
        })
        .build();

      const v1Data = { name: 'John', __v: 'v1' };
      const result = schema.getValue(v1Data);

      expect(result).toEqual({
        name: 'John',
        age: 25,
        email: 'john@example.com',
      });
      expect(result).not.toHaveProperty('__v');
    });

    it('should handle data from intermediate versions', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .evolve('v3', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ email: Schema.String })),
          transformValue: (old) => ({ ...old, email: 'john@example.com' }),
        })
        .build();

      const v2Data = { name: 'John', age: 30, __v: 'v2' };
      const result = schema.getValue(v2Data);

      expect(result).toEqual({
        name: 'John',
        age: 30,
        email: 'john@example.com',
      });
      expect(result).not.toHaveProperty('__v');
    });

    it('should return latest version data as-is (minus __v)', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const latestData = { name: 'John', age: 30, __v: 'v2' };
      const result = schema.getValue(latestData);

      expect(result).toEqual({ name: 'John', age: 30 });
      expect(result).not.toHaveProperty('__v');
    });

    it('should throw error for unknown version', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();

      const invalidData = { name: 'John', __v: 'v999' };

      expect(() => schema.getValue(invalidData)).toThrow(
        'Version v999 not found in schema history',
      );
    });

    it('should throw error for invalid data structure', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();

      expect(() => schema.getValue({ name: 123, __v: 'v1' })).toThrow();
    });

    it('should throw error for missing __v field', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();

      expect(() => schema.getValue({ name: 'John' })).toThrow();
    });
  });

  describe('getLatest()', () => {
    it('should validate and return data for latest schema', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const latestData = { name: 'John', age: 30, __v: 'v2' };
      const result = schema.getLatest(latestData);

      expect(result).toEqual({ name: 'John', age: 30 });
      expect(result).not.toHaveProperty('__v');
    });

    it('should throw error for data without __v field', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();

      const data = { name: 'John' };

      expect(() => schema.getLatest(data)).toThrow();
    });

    it('should throw error for invalid latest schema data', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const invalidData = { name: 'John' }; // Missing required age field for v2

      expect(() => schema.getLatest(invalidData)).toThrow();
    });
  });

  describe('validate()', () => {
    it('should validate data against latest schema with version', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const validData = { name: 'John', age: 30, __v: 'v2' };
      const result = schema.validate(validData);

      expect(result).toEqual({ name: 'John', age: 30, __v: 'v2' });
    });

    it('should throw error for invalid data', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();

      const invalidData = { name: 123, __v: 'v1' };

      expect(() => schema.validate(invalidData)).toThrow();
    });
  });

  describe('validateLatest()', () => {
    it('should add version and validate against latest schema', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const data = { name: 'John', age: 30 };
      const result = schema.validateLatest(data);

      expect(result).toEqual({ name: 'John', age: 30, __v: 'v2' });
    });

    it('should handle null/undefined values safely', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();

      expect(() => schema.validateLatest(null)).toThrow();
      expect(() => schema.validateLatest(undefined)).toThrow();
    });

    it('should throw error for data that doesnt match latest schema', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const invalidData = { name: 'John' }; // Missing age for v2

      expect(() => schema.validateLatest(invalidData)).toThrow();
    });
  });

  describe('latest getter', () => {
    it('should return the latest schema', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ age: Schema.Number })),
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const latest = schema.latest;
      expect(latest).toBeDefined();

      // Should be able to validate v2 data with the latest schema
      const validV2Data = { name: 'John', age: 30, __v: 'v2' };
      expect(() => Schema.decodeUnknownSync(latest)(validV2Data)).not.toThrow();
    });
  });

  describe('complex schema evolution scenarios', () => {
    it('should handle field renaming', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({
          firstName: Schema.String,
        }),
      )
        .evolve('v2', {
          transformSchema: () =>
            Schema.Struct({
              fullName: Schema.String,
            }),
          transformValue: (old) => ({
            fullName: old.firstName,
          }),
        })
        .build();

      const oldData = { firstName: 'John', __v: 'v1' };
      const result = schema.getValue(oldData);

      expect(result).toEqual({ fullName: 'John' });
    });

    it('should handle field type changes', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({
          count: Schema.String,
        }),
      )
        .evolve('v2', {
          transformSchema: () =>
            Schema.Struct({
              count: Schema.Number,
            }),
          transformValue: (old) => ({
            count: Number.parseInt(old.count, 10),
          }),
        })
        .build();

      const oldData = { count: '42', __v: 'v1' };
      const result = schema.getValue(oldData);

      expect(result).toEqual({ count: 42 });
    });

    it('should handle removing fields', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({
          name: Schema.String,
          deprecated: Schema.String,
        }),
      )
        .evolve('v2', {
          transformSchema: () =>
            Schema.Struct({
              name: Schema.String,
            }),
          transformValue: (old) => ({
            name: old.name,
          }),
        })
        .build();

      const oldData = { name: 'John', deprecated: 'old-value', __v: 'v1' };
      const result = schema.getValue(oldData);

      expect(result).toEqual({ name: 'John' });
      expect(result).not.toHaveProperty('deprecated');
    });

    it('should handle nested object evolution', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({
          user: Schema.Struct({
            name: Schema.String,
          }),
        }),
      )
        .evolve('v2', {
          transformSchema: () =>
            Schema.Struct({
              user: Schema.Struct({
                name: Schema.String,
                email: Schema.String,
              }),
            }),
          transformValue: (old) => ({
            user: {
              ...old.user,
              email: 'default@example.com',
            },
          }),
        })
        .build();

      const oldData = {
        user: { name: 'John' },
        __v: 'v1',
      };
      const result = schema.getValue(oldData);

      expect(result).toEqual({
        user: {
          name: 'John',
          email: 'default@example.com',
        },
      });
    });

    it('should handle multiple concurrent field changes', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({
          name: Schema.String,
          age: Schema.String,
        }),
      )
        .evolve('v2', {
          transformSchema: Schema.Struct({
            fullName: Schema.String,
            age: Schema.Number,
            isActive: Schema.Boolean,
          }),
          transformValue: (old) => ({
            fullName: old.name,
            age: Number.parseInt(old.age, 10),
            isActive: true,
          }),
        })
        .build();

      const oldData = { name: 'John', age: '30', __v: 'v1' };
      const result = schema.getValue(oldData);

      expect(result).toEqual({
        fullName: 'John',
        age: 30,
        isActive: true,
      });
    });
  });

  describe('error handling', () => {
    it('should handle malformed version data', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({ name: Schema.String }),
      ).build();

      expect(() => schema.getValue({ name: 'John', __v: null })).toThrow();
      expect(() => schema.getValue({ name: 'John', __v: 123 })).toThrow();
      expect(() => schema.getValue({ name: 'John', __v: {} })).toThrow();
    });

    it('should handle data validation errors during migration', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({
          count: Schema.String,
        }),
      )
        .evolve('v2', {
          transformSchema: () =>
            Schema.Struct({
              count: Schema.Number,
            }),
          transformValue: (old) => ({
            count: Number.parseInt(old.count, 10),
          }),
        })
        .build();

      // This should fail validation at v1 level
      const invalidData = { count: 123, __v: 'v1' };
      expect(() => schema.getValue(invalidData)).toThrow();
    });

    it('should handle transformation function errors', () => {
      const schema = ESchema.make(
        'v1',
        Schema.Struct({
          value: Schema.String,
        }),
      )
        .evolve('v2', {
          transformSchema: () =>
            Schema.Struct({
              value: Schema.Number,
            }),
          transformValue: () => {
            throw new Error('Transformation failed');
          },
        })
        .build();

      const data = { value: 'test', __v: 'v1' };
      expect(() => schema.getValue(data)).toThrow('Transformation failed');
    });
  });

  describe('transformSchema variations', () => {
    it('should support function-based transformSchema (existing behavior)', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: (schema) => {
            // This test verifies proper type inference - schema should be typed correctly
            // The following lines test compile-time types only (not executed at runtime)
            if (false) {
              const _typeTest: typeof schema.Type = null as any;
              const _nameField: string = _typeTest.name; // Should compile without error
            }
            return Schema.extend(schema, Schema.Struct({ age: Schema.Number }));
          },
          transformValue: (old) => ({ ...old, age: 25 }),
        })
        .build();

      const oldData = { name: 'John', __v: 'v1' };
      const result = schema.getValue(oldData);

      expect(result).toEqual({ name: 'John', age: 25 });
    });

    it('should support direct schema provision (new behavior)', () => {
      const schema = ESchema.make('v1', Schema.Struct({ name: Schema.String }))
        .evolve('v2', {
          transformSchema: Schema.Struct({ name: Schema.String, age: Schema.Number }),
          transformValue: (old) => ({ ...old, age: 30 }),
        })
        .build();

      const oldData = { name: 'Alice', __v: 'v1' };
      const result = schema.getValue(oldData);

      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should handle completely different schema with direct provision', () => {
      const schema = ESchema.make('v1', Schema.Struct({ firstName: Schema.String }))
        .evolve('v2', {
          transformSchema: Schema.Struct({ fullName: Schema.String }),
          transformValue: (old) => ({ fullName: old.firstName }),
        })
        .build();

      const oldData = { firstName: 'Bob', __v: 'v1' };
      const result = schema.getValue(oldData);

      expect(result).toEqual({ fullName: 'Bob' });
    });
  });
});
