import { Schema } from 'effect';

export const TreeNodeKindSchema = Schema.Literals(['module', 'wrapper']);

export type TreeNodeKind = typeof TreeNodeKindSchema.Type;

export const TreeNodeShapeSchema = Schema.Literals(['folder', 'file']);

export type TreeNodeShape = typeof TreeNodeShapeSchema.Type;

/**
 * One node of the Module tree: a Module (a folder with an Index, or a File
 * Module) or a Wrapper (a folder without one). The root is the Project folder
 * itself, at path `.`.
 */
export const TreeNodeSchema = Schema.Struct({
  path: Schema.String,
  kind: TreeNodeKindSchema,
  shape: TreeNodeShapeSchema,
  // The Module's Index: its index file for a folder Module, itself for a File
  // Module. Absent for a Wrapper.
  index: Schema.optional(Schema.String),
  // Analyzed files owned by this node that lie in no nested Module. A plain
  // Wrapper owning files is a Wrapper coverage finding.
  ownFiles: Schema.Array(Schema.String),
  // Absent for the root.
  parent: Schema.optional(Schema.String),
  children: Schema.Array(Schema.String),
});

export type TreeNode = typeof TreeNodeSchema.Type;

export const ModuleTreeSchema = Schema.Struct({
  root: Schema.String,
  nodes: Schema.Array(TreeNodeSchema),
  // Every analyzed file mapped to the node owning it.
  owners: Schema.Record(Schema.String, Schema.String),
});

export type ModuleTree = typeof ModuleTreeSchema.Type;
