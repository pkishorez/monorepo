import type { DistributiveOmit } from './types.js';
import { Schema } from 'effect';
import { safeSpread } from './utils.js';

/**
 * Represents a value with an attached version identifier
 */
type TypeWithVersion<Value, Version extends string> = Value & { __v: Version };

/**
 * Internal result structure for schema evolution steps
 */
interface BuilderResult<Version extends string, OldValue, NewValue> {
  readonly version: Version;
  schema: Schema.Schema<TypeWithVersion<NewValue, Version>>;
  transformValue: (value: OldValue) => TypeWithVersion<NewValue, Version>;
}

/**
 * Builder interface for creating evolving schemas with multiple versions
 */
interface Builder<
  AllVersions,
  OldValue,
  OldValueWithVersion,
  Result extends unknown[],
> {
  evolve: <NewVersion extends string, NewValue>(
    version: NewVersion,
    value: {
      transformSchema:
        | Schema.Schema<NewValue>
        | ((schema: Schema.Schema<OldValue>) => Schema.Schema<NewValue>);
      transformValue: (value: OldValue) => NewValue;
    },
  ) => Builder<
    AllVersions | NewVersion,
    NewValue,
    TypeWithVersion<NewValue, NewVersion>,
    [...Result, BuilderResult<NewVersion, OldValue, NewValue>]
  >;
  build: () => ESchema<OldValueWithVersion>;
}

/**
 * Adds version information to a schema
 */
function schemaWithVersion<Version extends string, T>(
  version: Version,
  schema: Schema.Schema<T>,
): Schema.Schema<TypeWithVersion<T, Version>> {
  return Schema.asSchema(
    Schema.extend(schema, Schema.Struct({ __v: Schema.Literal(version) })),
  );
}

/**
 * Type guard to check if a value is a Schema (not a transform function)
 */
function isSchema<T>(
  value: Schema.Schema<T> | ((schema: Schema.Schema<any>) => Schema.Schema<T>),
): value is Schema.Schema<T> {
  return typeof value === 'function' && 'ast' in value;
}

/**
 * Adds version information to a value
 */
function valueWithVersion<Version extends string, T>(
  version: Version,
  value: T,
): TypeWithVersion<T, Version> {
  return { ...value, __v: version };
}

function builder<
  AllVersions extends string,
  Value,
  ValueWithVersion,
  Result extends unknown[],
>(
  oldSchema: Schema.Schema<Value>,
  result: Result,
  latest: Schema.Schema<ValueWithVersion>,
  latestVersion: string,
): Builder<AllVersions, Value, ValueWithVersion, Result> {
  return {
    evolve(newVersion, { transformSchema, transformValue }) {
      const newSchema = isSchema(transformSchema)
        ? transformSchema
        : transformSchema(oldSchema);

      const next: BuilderResult<
        typeof newVersion,
        typeof oldSchema.Type,
        typeof newSchema.Type
      > = {
        version: newVersion,
        schema: schemaWithVersion(newVersion, newSchema),
        transformValue: (oldValue) =>
          valueWithVersion(newVersion, transformValue(oldValue)),
      };

      return builder(
        newSchema,
        [...result, next],
        schemaWithVersion(newVersion, newSchema),
        newVersion,
      );
    },
    build() {
      return new ESchema({
        results: result as readonly BuilderResult<string, unknown, unknown>[],
        latest,
        latestVersion,
      });
    },
  };
}

/**
 * Evolving Schema - handles data migration across schema versions
 * Provides type-safe access to versioned data with automatic migration
 */
export class ESchema<Value> {
  constructor(
    private readonly config: {
      readonly results: readonly BuilderResult<string, unknown, unknown>[];
      readonly latest: Schema.Schema<Value>;
      readonly latestVersion: string;
    },
  ) {}

  /**
   * Retrieves a value and migrates it from its stored version to the latest version
   */
  getValue(value: unknown): DistributiveOmit<Value, '__v'> {
    const { results } = this.config;
    const versionSchema = Schema.Struct({
      __v: Schema.String,
    });
    const { __v: version } = Schema.decodeUnknownSync(versionSchema)(value);

    const found = results.findIndex((r) => r.version === version);
    if (found === -1) {
      throw new Error(`Version ${version} not found in schema history`);
    }
    const [current, ...migrations] = results.filter(
      (r) => r.version >= version,
    );

    const validValue = Schema.decodeUnknownSync(current.schema)(value);

    const latestValue = migrations.reduce(
      (acc, migration) => migration.transformValue(acc),
      validValue,
    );

    // Remove the version field from the final value
    const { __v, ...result } = latestValue;
    return result as DistributiveOmit<Value, '__v'>;
  }

  /**
   * Validates a value against the latest schema without migration
   */
  getLatest(value: unknown): DistributiveOmit<Value, '__v'> {
    const { latest } = this.config;
    const validValue = Schema.decodeUnknownSync(latest)(value);
    if (validValue && typeof validValue === 'object' && '__v' in validValue) {
      const { __v, ...result } = validValue;
      return result as DistributiveOmit<Value, '__v'>;
    }

    return validValue as DistributiveOmit<Value, '__v'>;
  }

  validate(value: unknown) {
    const { latest } = this.config;
    return Schema.decodeUnknownSync(latest)(value);
  }

  /**
   * Validates a value and adds the latest version identifier
   */
  validateLatest(value: unknown) {
    return Schema.decodeUnknownSync(this.config.latest)({
      ...safeSpread(value),
      __v: this.config.latestVersion,
    });
  }

  get latest() {
    return this.config.latest;
  }

  /**
   * Creates a new evolving schema with an initial version
   */
  static make<InitialVersion extends string, InitialValue>(
    version: InitialVersion,
    schema: Schema.Schema<InitialValue>,
  ) {
    const transformValue: (
      v: null,
    ) => TypeWithVersion<InitialValue, InitialVersion> = () => {
      throw new Error('This is the initial schema, no value to transform');
    };
    return builder(
      schema,
      [{ version, schema: schemaWithVersion(version, schema), transformValue }],
      schemaWithVersion(version, schema),
      version,
    );
  }
}

/**
 * Utility type to extract the data type from an ESchema
 */
export type ESchemaType<T extends ESchema<unknown>> =
  T extends ESchema<infer U> ? DistributiveOmit<U, '__v'> : never;
