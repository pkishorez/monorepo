import type { StdDescriptor, IndexDescriptor } from "@std-toolkit/core";
import type { ESchemaDescriptor } from "@std-toolkit/eschema";

export interface DescriptorResponse {
  operation: "descriptor";
  timing: {
    startedAt: number;
    completedAt: number;
    durationMs: number;
  };
  descriptors: StdDescriptor[];
}

export interface IndexEntry {
  label: string;
  index: IndexDescriptor;
}

export interface TypeDisplay {
  type: string;
  color: string;
  title?: string;
}

export interface SchemaProperty {
  type?: string;
  enum?: string[];
  identifier?: string;
  [key: string]: unknown;
}

export type { StdDescriptor, IndexDescriptor, ESchemaDescriptor };
