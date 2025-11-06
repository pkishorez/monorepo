import { SchemaAST as AST, Option, Schema } from 'effect';

type PropertyInfo = {
  name: string | number | symbol;
  isOptional: boolean;
  isReadonly: boolean;
  typeTag: string;
  default?: unknown;
  description?: string;
  title?: string;
  literalValue?: AST.LiteralValue;
  unionLiterals?: Array<AST.LiteralValue>;
  brands?: ReadonlyArray<string | symbol>;
};

type SchemaInspection = {
  typeTag: string;
  properties: ReadonlyArray<PropertyInfo>;
};

/**
 * Inspects an Effect Schema and returns detailed information about its structure
 */
export function inspectSchema<A, I, R>(
  schema: Schema.Schema<A, I, R>,
): SchemaInspection {
  const ast = schema.ast;
  const propertySignatures = AST.getPropertySignatures(ast);

  return {
    typeTag: ast._tag,
    properties: propertySignatures.map(
      (ps): PropertyInfo => ({
        name: ps.name,
        isOptional: ps.isOptional,
        isReadonly: ps.isReadonly,
        typeTag: ps.type._tag,
        default: Option.getOrUndefined(AST.getDefaultAnnotation(ps)),
        description: Option.getOrUndefined(AST.getDescriptionAnnotation(ps)),
        title: Option.getOrUndefined(AST.getTitleAnnotation(ps)),
        literalValue: AST.isLiteral(ps.type) ? ps.type.literal : undefined,
        unionLiterals: AST.isUnion(ps.type)
          ? ps.type.types
              .map((t) => (AST.isLiteral(t) ? t.literal : undefined))
              .filter((v): v is AST.LiteralValue => v !== undefined)
          : undefined,
        brands: Option.getOrUndefined(AST.getBrandAnnotation(ps.type)),
      }),
    ),
  };
}
