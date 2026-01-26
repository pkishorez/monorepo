import type { ESchemaDescriptor } from "@std-toolkit/eschema";

/**
 * Describes how an index key pattern is derived from entity fields.
 */
export interface IndexPatternDescriptor {
  /** Field names that the key depends on */
  deps: string[];
  /** String pattern showing the key format (e.g., "ENTITY#{field1}#{field2}") */
  pattern: string;
}

/**
 * Describes an index structure with partition and sort key patterns.
 */
export interface IndexDescriptor {
  /** Name of the index (e.g., "primary", "byEmail") */
  name: string;
  /** Partition key pattern descriptor */
  pk: IndexPatternDescriptor;
  /** Sort key pattern descriptor */
  sk: IndexPatternDescriptor;
}

/**
 * Unified descriptor for a database entity/table including its schema and index configuration.
 * Used by both DynamoDB entities and SQLite tables.
 */
export interface StdDescriptor {
  /** Name of the entity/table */
  name: string;
  /** Schema version string */
  version: string;
  /** Primary index descriptor */
  primaryIndex: IndexDescriptor;
  /** Secondary index descriptors */
  secondaryIndexes: IndexDescriptor[];
  /** ESchema descriptor for the data schema */
  schema: ESchemaDescriptor;
}

/**
 * Schema containing descriptors for all entities/tables in a registry.
 * Base interface extended by database-specific schema types.
 */
export interface RegistrySchema {
  /** All descriptors in this registry */
  descriptors: StdDescriptor[];
}

/**
 * Interface for registries that can provide their schema.
 * Implemented by TableRegistry (DynamoDB) and DatabaseRegistry (SQLite).
 */
export interface DescriptorProvider {
  /** Returns the registry schema containing all descriptors */
  getSchema(): RegistrySchema;
}

/**
 * Interface for entities/tables that can provide their descriptor.
 * Implemented by DynamoEntity and SQLiteTable.
 */
export interface DescriptorSource {
  /** Returns the descriptor for this entity/table */
  getDescriptor(): StdDescriptor;
}
