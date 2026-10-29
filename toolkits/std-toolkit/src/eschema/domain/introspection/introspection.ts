import { SchemaAST } from 'effect';
import type { Schema, SchemaTransformation } from 'effect';

export type ESchemaKind = 'struct' | 'entity' | 'value';

export interface ESchemaEvolutionIntrospection {
  readonly version: string;
  readonly schema: Schema.Top;
  /** Declared with no migration: a Backfill fills it, never a read. */
  readonly gap: boolean;
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

const isEncodedStringAst = (ast: SchemaAST.AST): boolean => {
  if (SchemaAST.isString(ast) || SchemaAST.isTemplateLiteral(ast)) return true;
  if (SchemaAST.isLiteral(ast)) return typeof ast.literal === 'string';
  if (SchemaAST.isEnum(ast)) {
    return (
      ast.enums.length > 0 &&
      ast.enums.every(([, value]) => typeof value === 'string')
    );
  }
  if (SchemaAST.isUnion(ast)) {
    return (
      ast.types.some((member) => isEncodedStringAst(member)) &&
      ast.types.every(
        (member) => isEncodedStringAst(member) || SchemaAST.isNull(member),
      )
    );
  }
  return false;
};

export function isEncodedStringSchema(schema: Schema.Top): boolean {
  return isEncodedStringAst(SchemaAST.toEncoded(schema.ast));
}

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

// The latest version's own schema: a struct of the latest fields, or a value
// schema's inner schema. No `_v`, no migration.
export function latestSchema(eschema: object): Schema.Top {
  const { name, evolutions } = inspectESchema(eschema);
  const latest = evolutions.at(-1);
  if (latest === undefined)
    throw new TypeError(`ESchema ${name} has no versions`);
  return latest.schema;
}

/** The gap versions of an ESchema, oldest first. */
export function gapVersions(eschema: object): readonly string[] {
  return inspectESchema(eschema)
    .evolutions.filter((evolution) => evolution.gap)
    .map((evolution) => evolution.version);
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

/** Every ESchema composed anywhere inside `ast`, on either side of a transformation. */
export function findNestedESchemas(
  ast: SchemaAST.AST,
): readonly { readonly eschema: object; readonly identity: string }[] {
  const found = new Map<object, { eschema: object; identity: string }>();
  const seen = new WeakSet<object>();
  const walk = (node: SchemaAST.AST): void => {
    if (seen.has(node)) return;
    seen.add(node);
    const composition = compositions.get(node);
    if (composition !== undefined) {
      found.set(composition.eschema, composition);
      return;
    }
    for (const link of node.encoding ?? []) walk(link.to);
    switch (node._tag) {
      case 'Objects':
        node.propertySignatures.forEach((property) => walk(property.type));
        node.indexSignatures.forEach((signature) => {
          walk(signature.parameter);
          walk(signature.type);
        });
        return;
      case 'Arrays':
        node.elements.forEach(walk);
        node.rest.forEach(walk);
        return;
      case 'Union':
        node.types.forEach(walk);
        return;
      case 'Declaration':
        node.typeParameters.forEach(walk);
        return;
      case 'Suspend':
        walk(node.thunk());
        return;
    }
  };
  walk(ast);
  return [...found.values()];
}

/**
 * Refuses a version that nests an ESchema with a gap version. A nested value
 * is read wherever its parent is and has no Backfill of its own, so it must
 * always migrate.
 */
export function refuseNestedGap(
  name: string,
  version: string,
  ast: SchemaAST.AST,
): void {
  for (const { eschema, identity } of findNestedESchemas(ast)) {
    const [gap] = gapVersions(eschema);
    if (gap !== undefined) {
      throw new Error(
        `${name} ${version}: a field nests ${identity}, whose ${gap} is a gap version. A nested ESchema must migrate every version; put the gap version on the stored entity instead.`,
      );
    }
  }
}
