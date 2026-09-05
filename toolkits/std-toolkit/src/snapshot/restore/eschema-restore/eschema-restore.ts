import { Schema, SchemaRepresentation } from 'effect';
import type { ESchemaDefinition } from '../../domain/index.js';
import { SnapshotDecodeError } from '../../domain/index.js';

export interface RestoredESchemaVersion {
  readonly version: string;
  readonly encoded: Schema.Top;
  readonly decoded: Schema.Top;
}

export interface RestoredESchema {
  readonly identity: string;
  readonly kind: ESchemaDefinition['kind'];
  readonly idField: string | null;
  readonly versions: readonly RestoredESchemaVersion[];
}

type Side = 'encoded' | 'decoded';

const referenceId = 'std-toolkit/snapshot-eschema-ref';
const ReferencePayload = Schema.Struct({ identity: Schema.String });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A composed field is captured as a lightweight `ESchemaRef` pointer, not the
 * declare+transform wrapper that produced it (see eschema-capture.ts). Before
 * that JSON can go through SchemaRepresentation.fromJson, every ref pointer
 * has to look like the Declaration node fromJson actually understands.
 */
function substituteReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(substituteReferences);
  if (!isRecord(value)) return value;
  if (value._tag === 'ESchemaRef' && typeof value.identity === 'string') {
    return {
      _tag: 'Declaration',
      representation: {
        id: referenceId,
        payload: { identity: value.identity },
      },
      typeParameters: [],
      checks: [],
    };
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = substituteReferences(child);
  }
  return output;
}

function makeReferenceReviver(resolve: (identity: string) => Schema.Top) {
  return SchemaRepresentation.makeDeclarationReviver(
    referenceId,
    ReferencePayload,
    ({ payload }) => resolve(payload.identity),
  );
}

function restoreField(
  json: unknown,
  resolve: (identity: string) => Schema.Top,
): Schema.Top {
  const document = SchemaRepresentation.fromJson(
    substituteReferences(json) as Schema.Json,
  );
  const restored = SchemaRepresentation.fromRepresentation(document, {
    revivers: [makeReferenceReviver(resolve)],
  });
  return Schema.make(restored.ast);
}

/**
 * Rebuilds live, working schemas from a captured ESchemaSnapshot's
 * definitions, using Effect's own representation round trip. A composed
 * field resolves to the referenced identity's own latest restored version —
 * restore approximates structure only; migration behavior stays owned by
 * eschema, which needs the original source to run it.
 */
export function restoreESchemaDefinitions(
  definitions: readonly ESchemaDefinition[],
): readonly RestoredESchema[] {
  const restored = new Map<string, RestoredESchema>();

  const resolve = (identity: string, side: Side): Schema.Top =>
    Schema.suspend(() => {
      const latest = restored.get(identity)?.versions.at(-1);
      if (latest === undefined) {
        throw new SnapshotDecodeError(`Cannot resolve ESchemaRef: ${identity}`);
      }
      return latest[side];
    });

  for (const definition of definitions) {
    restored.set(definition.identity, {
      identity: definition.identity,
      kind: definition.kind,
      idField: definition.idField,
      versions: definition.versions.map((version) => ({
        version: version.version,
        encoded: restoreField(version.encoded, (identity) =>
          resolve(identity, 'encoded'),
        ),
        decoded: restoreField(version.decoded, (identity) =>
          resolve(identity, 'decoded'),
        ),
      })),
    });
  }

  return [...restored.values()];
}
