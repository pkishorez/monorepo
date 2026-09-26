import type { SchemaAST } from 'effect';
import {
  inspectESchema,
  inspectESchemaComposition,
} from '../../../eschema/domain/introspection/index.js';
import { describeSnapshotType } from '../../../eschema/domain/snapshot-type/index.js';
import type { ESchemaDefinition } from '../../domain/index.js';
import {
  compareStrings,
  SnapshotIdentityConflict,
} from '../../domain/index.js';

interface SnapshotESchemaRoot {
  readonly eschema: object;
  readonly identity?: string;
}

/** Every ESchema composed anywhere inside `ast`, on either side of a transformation. */
function collectCompositions(
  ast: SchemaAST.AST,
): readonly { readonly eschema: object; readonly identity: string }[] {
  const found = new Map<object, { eschema: object; identity: string }>();
  const seen = new WeakSet<object>();
  const walk = (node: SchemaAST.AST): void => {
    if (seen.has(node)) return;
    seen.add(node);
    const composition = inspectESchemaComposition(node);
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

function collectESchemas(roots: readonly SnapshotESchemaRoot[]) {
  const identityObjects = new Map<string, object>();
  const objectIdentities = new Map<object, string>();
  const pending = [...roots];
  const entries: {
    readonly identity: string;
    readonly introspection: ReturnType<typeof inspectESchema>;
  }[] = [];

  while (pending.length > 0) {
    const next = pending.shift()!;
    const introspection = inspectESchema(next.eschema);
    const identity = next.identity ?? introspection.name;
    if (identity === undefined || identity === '') {
      throw new SnapshotIdentityConflict('<anonymous nested ESchema>');
    }
    const claimed = identityObjects.get(identity);
    const priorIdentity = objectIdentities.get(next.eschema);
    if (claimed !== undefined && claimed !== next.eschema) {
      throw new SnapshotIdentityConflict(identity);
    }
    if (priorIdentity !== undefined && priorIdentity !== identity) {
      throw new SnapshotIdentityConflict(identity);
    }
    if (claimed === next.eschema) continue;
    identityObjects.set(identity, next.eschema);
    objectIdentities.set(next.eschema, identity);
    entries.push({ identity, introspection });
    for (const evolution of introspection.evolutions) {
      for (const child of collectCompositions(evolution.schema.ast)) {
        pending.push(child);
      }
    }
  }
  return entries;
}

/**
 * Every ESchema the roots reach, each version described by the snapshot type
 * of its encoded side. The `_v` stamp and a value's `{ _v, _value }` envelope
 * follow from the kind, so they are not repeated in every shape.
 */
export function buildESchemaDefinitions(
  roots: readonly SnapshotESchemaRoot[],
): readonly ESchemaDefinition[] {
  return collectESchemas(roots)
    .map(({ introspection, identity }) => ({
      identity,
      kind: introspection.kind,
      idField: introspection.idField,
      versions: introspection.evolutions.map((evolution) => ({
        version: evolution.version,
        shape: describeSnapshotType(evolution.schema.ast),
      })),
    }))
    .sort((a, b) => compareStrings(a.identity, b.identity));
}
