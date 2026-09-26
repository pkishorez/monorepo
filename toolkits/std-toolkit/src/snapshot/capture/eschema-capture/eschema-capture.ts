import { Schema, SchemaAST, SchemaRepresentation } from 'effect';
import {
  inspectESchema,
  inspectESchemaComposition,
} from '../../../eschema/domain/introspection/index.js';
import type { ESchemaDefinition, ESchemaVersion } from '../../domain/index.js';
import {
  compareStrings,
  SnapshotIdentityConflict,
} from '../../domain/index.js';

interface EvolutionLike {
  readonly version: string;
  readonly schema: Schema.Top;
}

interface SnapshotESchemaRoot {
  readonly eschema: object;
  readonly identity?: string;
}

const presentationKeys = new Set([
  'title',
  'description',
  'examples',
  'default',
  'expected',
  'generation',
  'format',
]);

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function representationId(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.representation)) return undefined;
  return typeof value.representation.id === 'string'
    ? value.representation.id
    : undefined;
}

function persistedPrimitive(value: unknown): unknown {
  return isRecord(value) && 'type' in value && 'value' in value
    ? value.value
    : value;
}

function canonicalize(
  value: unknown,
  references: ReadonlyMap<string, string>,
): unknown {
  if (Array.isArray(value)) {
    const values = value.map((item) => canonicalize(item, references));
    if (
      values.every(
        (item) =>
          isRecord(item) && typeof persistedPrimitive(item.name) === 'string',
      )
    ) {
      return values.toSorted((a, b) =>
        compareStrings(
          String(persistedPrimitive((a as Record<string, unknown>).name)),
          String(persistedPrimitive((b as Record<string, unknown>).name)),
        ),
      );
    }
    return values;
  }
  if (!isRecord(value)) return value;

  const annotationIdentity = isRecord(value.annotations)
    ? value.annotations.eschemaIdentity
    : undefined;
  if (typeof annotationIdentity === 'string') {
    return { _tag: 'ESchemaRef', identity: annotationIdentity };
  }
  if (value._tag === 'Reference' && typeof value.$ref === 'string') {
    const identity = references.get(value.$ref);
    if (identity !== undefined) return { _tag: 'ESchemaRef', identity };
  }

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (presentationKeys.has(key)) continue;
    if (value[key] === undefined) continue;
    const next = canonicalize(value[key], references);
    if (key === 'annotations' && isRecord(next)) {
      const annotations = Object.fromEntries(
        Object.entries(next).filter(
          ([name]) => name !== 'identifier' && name !== 'eschemaIdentity',
        ),
      );
      if (Object.keys(annotations).length > 0) output[key] = annotations;
    } else {
      output[key] = next;
    }
  }
  return output;
}

// ESchema refuses other declarations, so any left here is a composed ESchema.
function sanitizeRepresentation(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeRepresentation);
  if (!isRecord(value)) return value;
  if (value._tag === 'Declaration' && representationId(value) === undefined) {
    const reference = isRecord(value.annotations)
      ? value.annotations.eschemaReference
      : undefined;
    return { _tag: 'Reference', $ref: reference };
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = sanitizeRepresentation(child);
  }
  return output;
}

function representation(
  schema: Schema.Top,
  references: ReadonlyMap<string, string>,
): Schema.Json {
  const document = sanitizeRepresentation(
    SchemaRepresentation.toRepresentation(schema.ast),
  ) as SchemaRepresentation.Document;
  const json = SchemaRepresentation.toJson(document);
  return canonicalize(json, references) as Schema.Json;
}

function walkAst(
  value: unknown,
  visit: (ast: SchemaAST.AST, path: string) => boolean | void,
  path = '',
  seen = new WeakSet<object>(),
): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  try {
    if (SchemaAST.isAST(value)) {
      if (visit(value, path) === false) return;
      for (const link of value.encoding ?? []) {
        walkAst(link.to, visit, `${path}/encoded`, seen);
      }
      switch (value._tag) {
        case 'Objects':
          value.propertySignatures.forEach((property) =>
            walkAst(
              property.type,
              visit,
              `${path}/properties/${escapePointer(String(property.name))}`,
              seen,
            ),
          );
          value.indexSignatures.forEach((signature, index) => {
            walkAst(
              signature.parameter,
              visit,
              `${path}/indexSignatures/${index}/parameter`,
              seen,
            );
            walkAst(
              signature.type,
              visit,
              `${path}/indexSignatures/${index}/type`,
              seen,
            );
          });
          return;
        case 'Arrays':
          value.elements.forEach((element, index) =>
            walkAst(element, visit, `${path}/elements/${index}`, seen),
          );
          value.rest.forEach((element, index) =>
            walkAst(element, visit, `${path}/rest/${index}`, seen),
          );
          return;
        case 'Union':
          value.types.forEach((type, index) =>
            walkAst(type, visit, `${path}/types/${index}`, seen),
          );
          return;
        case 'Declaration':
          value.typeParameters.forEach((type, index) =>
            walkAst(type, visit, `${path}/typeParameters/${index}`, seen),
          );
          return;
        case 'Suspend':
          walkAst(value.thunk(), visit, `${path}/suspend`, seen);
          return;
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        walkAst(item, visit, `${path}/${index}`, seen),
      );
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'run' || key === 'decode' || key === 'encode') continue;
      walkAst(child, visit, `${path}/${escapePointer(key)}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function collectCompositions(ast: SchemaAST.AST): readonly {
  readonly eschema: object;
  readonly identity: string;
}[] {
  const found = new Map<object, { eschema: object; identity: string }>();
  walkAst(ast, (node) => {
    const metadata = inspectESchemaComposition(node);
    if (metadata !== undefined) {
      found.set(node, metadata);
      return false;
    }
  });
  return [...found.values()];
}

function versionSnapshot(
  evolution: EvolutionLike,
  kind: ESchemaDefinition['kind'],
  references: ReadonlyMap<string, string>,
): ESchemaVersion {
  const serialized =
    kind === 'value'
      ? Schema.Struct({
          _v: Schema.Literal(evolution.version),
          _value: evolution.schema,
        })
      : Schema.Struct({
          ...(evolution.schema as Schema.Struct<any>).fields,
          _v: Schema.Literal(evolution.version),
        });
  return {
    version: evolution.version,
    serialized: representation(Schema.toEncoded(serialized), references),
  };
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

export function buildESchemaDefinitions(
  roots: readonly SnapshotESchemaRoot[],
): readonly ESchemaDefinition[] {
  const entries = collectESchemas(roots);
  const referenceNames = new Map<string, string>();
  for (const { identity } of entries) {
    referenceNames.set(`ESchema_${identity}`, identity);
    referenceNames.set(`ValueESchema_${identity}`, identity);
  }
  return entries
    .map(({ introspection, identity }) => ({
      identity,
      kind: introspection.kind,
      idField: introspection.idField,
      versions: introspection.evolutions.map((evolution) =>
        versionSnapshot(evolution, introspection.kind, referenceNames),
      ),
    }))
    .sort((a, b) => compareStrings(a.identity, b.identity));
}
