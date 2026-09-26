import { SchemaAST } from 'effect';
import {
  inspectESchemaComposition,
  isESchemaCompositionPlumbing,
} from './introspection.js';

export interface UnrepresentableField {
  readonly path: string;
  readonly reason: 'filter' | 'declaration' | 'default';
}

const isConversion = (ast: SchemaAST.AST): boolean =>
  (ast.encoding ?? []).some(
    (link) => !isESchemaCompositionPlumbing(link.transformation),
  );

function walk(
  ast: SchemaAST.AST,
  path: string,
  seen: WeakSet<object>,
  insideConversion = false,
): UnrepresentableField | undefined {
  if (seen.has(ast)) return undefined;
  seen.add(ast);
  // A nested ESchema checked its own fields when it was built.
  if (inspectESchemaComposition(ast) !== undefined) return undefined;

  if (ast.context?.constructorDefault !== undefined) {
    return { path: path || '/', reason: 'default' };
  }
  // A conversion is not stored: only its encoded side must be capturable, and
  // any check on that side belongs to the conversion rather than the shape.
  if (isConversion(ast)) {
    return walk(SchemaAST.toEncoded(ast), path, seen, true);
  }
  if (!insideConversion && (ast.checks?.length ?? 0) > 0) {
    return { path: path || '/', reason: 'filter' };
  }

  switch (ast._tag) {
    case 'Declaration':
      return { path: path || '/', reason: 'declaration' };
    case 'Objects': {
      for (const property of ast.propertySignatures) {
        const found = walk(
          property.type,
          `${path}/${String(property.name)}`,
          seen,
          insideConversion,
        );
        if (found !== undefined) return found;
      }
      for (const [index, signature] of ast.indexSignatures.entries()) {
        const found =
          walk(
            signature.parameter,
            `${path}/indexSignatures/${index}/parameter`,
            seen,
            insideConversion,
          ) ??
          walk(
            signature.type,
            `${path}/indexSignatures/${index}/type`,
            seen,
            insideConversion,
          );
        if (found !== undefined) return found;
      }
      return undefined;
    }
    case 'Arrays': {
      for (const [index, element] of ast.elements.entries()) {
        const found = walk(element, `${path}/${index}`, seen, insideConversion);
        if (found !== undefined) return found;
      }
      for (const [index, element] of ast.rest.entries()) {
        const found = walk(
          element,
          `${path}/rest/${index}`,
          seen,
          insideConversion,
        );
        if (found !== undefined) return found;
      }
      return undefined;
    }
    case 'Union': {
      for (const [index, member] of ast.types.entries()) {
        const found = walk(member, `${path}/${index}`, seen, insideConversion);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    case 'Suspend':
      return walk(ast.thunk(), path, seen, insideConversion);
    default:
      return undefined;
  }
}

/**
 * A field is representable when a Snapshot can capture its encoded form and
 * restore a live schema of that form with nothing lost. A conversion (such as
 * `Schema.DateFromString`) is allowed because only its encoded side is stored. ESchema composition (one
 * ESchema nested inside another) is restored by resolving the reference, not
 * by reviving the wrapping transform/declaration. UniqueSymbol is a known
 * unchecked edge case: capture supports Symbol.for(...) but fails for a local
 * Symbol(...).
 */
export function findUnrepresentableField(
  ast: SchemaAST.AST,
): UnrepresentableField | undefined {
  return walk(ast, '', new WeakSet());
}
