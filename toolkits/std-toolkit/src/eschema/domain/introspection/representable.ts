import type { SchemaAST } from 'effect';
import {
  inspectESchemaComposition,
  isESchemaCompositionPlumbing,
} from './introspection.js';

export interface UnrepresentableField {
  readonly path: string;
  readonly reason: 'transformation' | 'filter' | 'declaration';
}

function walk(
  ast: SchemaAST.AST,
  path: string,
  seen: WeakSet<object>,
): UnrepresentableField | undefined {
  if (seen.has(ast)) return undefined;
  seen.add(ast);

  if ((ast.checks?.length ?? 0) > 0) {
    return { path: path || '/', reason: 'filter' };
  }
  for (const link of ast.encoding ?? []) {
    if (!isESchemaCompositionPlumbing(link.transformation)) {
      return { path: path || '/', reason: 'transformation' };
    }
  }

  switch (ast._tag) {
    case 'Declaration':
      return inspectESchemaComposition(ast) !== undefined
        ? undefined
        : { path: path || '/', reason: 'declaration' };
    case 'Objects': {
      for (const property of ast.propertySignatures) {
        const found = walk(
          property.type,
          `${path}/${String(property.name)}`,
          seen,
        );
        if (found !== undefined) return found;
      }
      for (const [index, signature] of ast.indexSignatures.entries()) {
        const found =
          walk(
            signature.parameter,
            `${path}/indexSignatures/${index}/parameter`,
            seen,
          ) ??
          walk(signature.type, `${path}/indexSignatures/${index}/type`, seen);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    case 'Arrays': {
      for (const [index, element] of ast.elements.entries()) {
        const found = walk(element, `${path}/${index}`, seen);
        if (found !== undefined) return found;
      }
      for (const [index, element] of ast.rest.entries()) {
        const found = walk(element, `${path}/rest/${index}`, seen);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    case 'Union': {
      for (const [index, member] of ast.types.entries()) {
        const found = walk(member, `${path}/${index}`, seen);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    case 'Suspend':
      return walk(ast.thunk(), path, seen);
    default:
      return undefined;
  }
}

/**
 * A field is representable when a Snapshot can capture it and restore a live
 * schema from that capture with nothing lost. ESchema composition (one
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
