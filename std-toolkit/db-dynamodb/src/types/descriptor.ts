import type { ESchemaDescriptor } from "@std-toolkit/eschema";

/**
 * Describes how an index key pattern is derived from entity fields.
 */
export interface IndexPatternDescriptor {
  /** Field names that the key depends on */
  deps: string[];
  /** String pattern showing the key format (e.g., "ENTITY#${field1}#${field2}") */
  pattern: string;
}

/**
 * Describes a DynamoDB index structure.
 */
export interface IndexDescriptor {
  /** Name of the index (empty string for primary index) */
  name: string;
  /** Partition key pattern descriptor */
  pk: IndexPatternDescriptor;
  /** Sort key pattern descriptor */
  sk: IndexPatternDescriptor;
}

/**
 * Complete descriptor for a DynamoDB entity including its schema and index configuration.
 */
export interface EntityDescriptor {
  /** Name of the entity */
  name: string;
  /** Schema version string */
  version: string;
  /** Primary index descriptor */
  primaryIndex: IndexDescriptor;
  /** Secondary index descriptors */
  secondaryIndexes: IndexDescriptor[];
  /** ESchema descriptor for the entity's data schema */
  schema: ESchemaDescriptor;
}

/**
 * Complete schema descriptor for a DynamoDB table including all entities.
 */
export interface TableSchema {
  /** Name of the DynamoDB table */
  tableName: string;
  /** Primary key attribute names */
  primaryKey: { pk: string; sk: string };
  /** Global secondary index definitions */
  globalSecondaryIndexes: { name: string; pk: string; sk: string }[];
  /** Local secondary index definitions */
  localSecondaryIndexes: { name: string; sk: string }[];
  /** Entity descriptors for all entities in the table */
  entities: EntityDescriptor[];
}
