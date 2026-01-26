import type { ESchemaDescriptor } from "@std-toolkit/eschema";

export interface IndexPatternDescriptor {
  deps: string[];
  pattern: string;
}

export interface IndexDescriptor {
  name: string;
  pk: IndexPatternDescriptor;
  sk: IndexPatternDescriptor;
}

export interface EntityDescriptor {
  name: string;
  version: string;
  primaryIndex: IndexDescriptor;
  secondaryIndexes: IndexDescriptor[];
  schema: ESchemaDescriptor;
}

export interface TableSchema {
  tableName: string;
  primaryKey: { pk: string; sk: string };
  globalSecondaryIndexes: { name: string; pk: string; sk: string }[];
  localSecondaryIndexes: { name: string; sk: string }[];
  entities: EntityDescriptor[];
}
