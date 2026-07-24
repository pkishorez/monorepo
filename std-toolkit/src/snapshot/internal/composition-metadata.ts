import type { SchemaAST, SchemaTransformation } from 'effect';

export interface CompositionMetadata {
  readonly eschema: object;
  readonly identity: string;
}

const compositions = new WeakMap<object, CompositionMetadata>();
const plumbing = new WeakSet<object>();

export function registerComposition(
  ast: SchemaAST.AST,
  encodedAst: SchemaAST.AST,
  transformation: SchemaTransformation.Transformation<any, any, any, any>,
  metadata: CompositionMetadata,
): void {
  compositions.set(ast, metadata);
  compositions.set(encodedAst, metadata);
  plumbing.add(transformation);
}

export function getComposition(
  ast: SchemaAST.AST,
): CompositionMetadata | undefined {
  return compositions.get(ast);
}

export function isCompositionPlumbing(value: object): boolean {
  return plumbing.has(value);
}
