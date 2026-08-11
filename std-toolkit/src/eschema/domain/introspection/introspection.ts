import type { Schema, SchemaAST, SchemaTransformation } from 'effect';

export type ESchemaKind = 'struct' | 'entity' | 'value';

export interface ESchemaEvolutionIntrospection {
  readonly version: string;
  readonly schema: Schema.Top;
}

export interface ESchemaIntrospection {
  readonly name: string;
  readonly kind: ESchemaKind;
  readonly idField: string | null;
  readonly evolutions: readonly ESchemaEvolutionIntrospection[];
}

export interface ESchemaCompositionIntrospection {
  readonly eschema: object;
  readonly identity: string;
}

const eschemas = new WeakMap<object, () => ESchemaIntrospection>();
const inspected = new WeakMap<object, ESchemaIntrospection>();
const compositions = new WeakMap<object, ESchemaCompositionIntrospection>();
const compositionPlumbing = new WeakSet<object>();

export function registerESchemaIntrospection(
  eschema: object,
  introspection: () => ESchemaIntrospection,
): void {
  eschemas.set(eschema, introspection);
}

export function inspectESchema(eschema: object): ESchemaIntrospection {
  const cached = inspected.get(eschema);
  if (cached !== undefined) {
    return cached;
  }
  const introspection = eschemas.get(eschema);
  if (introspection === undefined) {
    throw new TypeError('Value is not an ESchema');
  }
  const resolved = introspection();
  inspected.set(eschema, resolved);
  return resolved;
}

export function registerESchemaComposition(
  ast: SchemaAST.AST,
  encodedAst: SchemaAST.AST,
  transformation: SchemaTransformation.Transformation<any, any, any, any>,
  introspection: ESchemaCompositionIntrospection,
): void {
  compositions.set(ast, introspection);
  compositions.set(encodedAst, introspection);
  compositionPlumbing.add(transformation);
}

export function inspectESchemaComposition(
  ast: SchemaAST.AST,
): ESchemaCompositionIntrospection | undefined {
  return compositions.get(ast);
}

export function isESchemaCompositionPlumbing(value: object): boolean {
  return compositionPlumbing.has(value);
}
