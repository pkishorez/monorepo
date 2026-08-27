import { Schema } from 'effect';

export const DocumentationScopeSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('module'), modulePath: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('module-graph'),
    layerId: Schema.String,
    graphId: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal('layer'), layerId: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('layer-graph'),
    graphId: Schema.String,
  }),
]);

export type DocumentationScope = typeof DocumentationScopeSchema.Type;

export const DocumentationSchema = Schema.Struct({
  scope: DocumentationScopeSchema,
  path: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
});

export type Documentation = typeof DocumentationSchema.Type;
