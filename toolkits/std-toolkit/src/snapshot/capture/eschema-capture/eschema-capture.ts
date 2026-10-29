import {
  findNestedESchemas,
  inspectESchema,
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
      for (const child of findNestedESchemas(evolution.schema.ast)) {
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
