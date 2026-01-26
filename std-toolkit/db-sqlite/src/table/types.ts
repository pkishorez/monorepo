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

export interface TableDescriptor {
  name: string;
  version: string;
  primaryIndex: IndexDescriptor;
  secondaryIndexes: IndexDescriptor[];
  schema: ESchemaDescriptor;
}
