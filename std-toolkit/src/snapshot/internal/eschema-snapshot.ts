import {
  Schema,
  SchemaAST,
  SchemaRepresentation,
  SchemaTransformation,
} from 'effect';
import {
  getComposition,
  isCompositionPlumbing,
} from './composition-metadata.js';
import type {
  ESchemaDefinition,
  ESchemaSnapshot,
  ESchemaVersion,
  SnapshotMarker,
} from '../model.js';
import { SnapshotIdentityConflict } from '../model.js';
import { compareStrings } from './stable-stringify.js';

interface EvolutionLike {
  readonly version: string;
  readonly schema: Schema.Top;
}

export interface SnapshotESchemaRoot {
  readonly eschema: object;
  readonly identity?: string;
}

interface ESchemaLike {
  readonly name: string;
  readonly idField?: string;
  readonly __snapshotKind: ESchemaDefinition['kind'];
  __snapshotEvolutions(): readonly EvolutionLike[];
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

const builtInDeclarationTags = new Set([
  'Date',
  'Error',
  'File',
  'FormData',
  'ReadonlyMap',
  'ReadonlySet',
  'RegExp',
  'Uint8Array',
  'URL',
  'URLSearchParams',
  'effect/BigDecimal',
  'effect/Cause',
  'effect/Cause/Failure',
  'effect/Chunk',
  'effect/DateTime.TimeZone',
  'effect/DateTime.TimeZone.Named',
  'effect/DateTime.TimeZone.Offset',
  'effect/DateTime.Utc',
  'effect/DateTime.Zoned',
  'effect/Duration',
  'effect/Exit',
  'effect/HashMap',
  'effect/HashSet',
  'effect/Json',
  'effect/MutableJson',
  'effect/Option',
  'effect/Redacted',
  'effect/Result',
]);

const builtInCheckTags = new Set([
  'isBase64',
  'isBase64Url',
  'isBetween',
  'isBetweenBigInt',
  'isBetweenDate',
  'isCapitalized',
  'isDateValid',
  'isEndsWith',
  'isFinite',
  'isGUID',
  'isGreaterThan',
  'isGreaterThanBigInt',
  'isGreaterThanDate',
  'isGreaterThanOrEqualTo',
  'isGreaterThanOrEqualToBigInt',
  'isGreaterThanOrEqualToDate',
  'isIncludes',
  'isInt',
  'isLengthBetween',
  'isLessThan',
  'isLessThanBigInt',
  'isLessThanDate',
  'isLessThanOrEqualTo',
  'isLessThanOrEqualToBigInt',
  'isLessThanOrEqualToDate',
  'isLowercased',
  'isMaxLength',
  'isMaxProperties',
  'isMaxSize',
  'isMinLength',
  'isMinProperties',
  'isMinSize',
  'isMultipleOf',
  'isPattern',
  'isPropertiesLengthBetween',
  'isPropertyNames',
  'isSizeBetween',
  'isStartsWith',
  'isStringBigInt',
  'isStringFinite',
  'isStringSymbol',
  'isTrimmed',
  'isULID',
  'isUUID',
  'isUncapitalized',
  'isUnique',
  'isUppercased',
]);

const allowedTransformations = new Map<object, string>([
  [SchemaTransformation.numberFromString, 'numberFromString'],
  [SchemaTransformation.bigintFromString, 'bigintFromString'],
  [SchemaTransformation.dateFromString, 'dateFromString'],
  [SchemaTransformation.dateFromMillis, 'dateFromMillis'],
  [SchemaTransformation.durationFromString, 'durationFromString'],
  [SchemaTransformation.durationFromNanos, 'durationFromNanos'],
  [SchemaTransformation.durationFromMillis, 'durationFromMillis'],
  [SchemaTransformation.urlFromString, 'urlFromString'],
  [SchemaTransformation.bigDecimalFromString, 'bigDecimalFromString'],
  [
    SchemaTransformation.uint8ArrayFromBase64String,
    'uint8ArrayFromBase64String',
  ],
  [SchemaTransformation.stringFromBase64String, 'stringFromBase64String'],
  [SchemaTransformation.stringFromBase64UrlString, 'stringFromBase64UrlString'],
  [SchemaTransformation.stringFromHexString, 'stringFromHexString'],
  [SchemaTransformation.stringFromUriComponent, 'stringFromUriComponent'],
  [SchemaTransformation.fromJsonString, 'fromJsonString'],
  [SchemaTransformation.fromFormData, 'fromFormData'],
  [SchemaTransformation.fromURLSearchParams, 'fromURLSearchParams'],
  [SchemaTransformation.timeZoneNamedFromString, 'timeZoneNamedFromString'],
  [SchemaTransformation.timeZoneFromString, 'timeZoneFromString'],
  [SchemaTransformation.dateTimeUtcFromString, 'dateTimeUtcFromString'],
  [SchemaTransformation.dateTimeZonedFromString, 'dateTimeZonedFromString'],
]);

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(
  value: unknown,
  references: ReadonlyMap<string, string>,
): unknown {
  if (Array.isArray(value)) {
    const values = value.map((item) => canonicalize(item, references));
    if (
      values.every((item) => isRecord(item) && typeof item.name === 'string')
    ) {
      return values.toSorted((a, b) =>
        compareStrings(
          String((a as Record<string, unknown>).name),
          String((b as Record<string, unknown>).name),
        ),
      );
    }
    return values;
  }
  if (!isRecord(value)) return value;

  const annotationIdentity = isRecord(value.annotations)
    ? value.annotations.snapshotESchemaIdentity
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
    const next = canonicalize(value[key], references);
    if (key === 'annotations' && isRecord(next)) {
      const annotations = Object.fromEntries(
        Object.entries(next).filter(
          ([name]) =>
            name !== 'identifier' && name !== 'snapshotESchemaIdentity',
        ),
      );
      if (Object.keys(annotations).length > 0) output[key] = annotations;
    } else {
      output[key] = next;
    }
  }
  return output;
}

function sanitizeRepresentation(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeRepresentation);
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'checks' && Array.isArray(child)) {
      output[key] = child
        .filter((check) => {
          if (!isRecord(check)) return false;
          if (check._tag === 'FilterGroup' && Array.isArray(check.checks)) {
            return check.checks.every(
              (nested) =>
                isRecord(nested) &&
                isRecord(nested.meta) &&
                builtInCheckTags.has(String(nested.meta._tag)),
            );
          }
          return (
            isRecord(check.meta) &&
            builtInCheckTags.has(String(check.meta._tag))
          );
        })
        .map(sanitizeRepresentation);
    } else {
      output[key] = sanitizeRepresentation(child);
    }
  }
  return output;
}

function representation(
  schema: Schema.Top,
  references: ReadonlyMap<string, string>,
): unknown {
  const document = sanitizeRepresentation(
    SchemaRepresentation.fromAST(schema.ast),
  ) as SchemaRepresentation.Document;
  const json = Schema.encodeSync(SchemaRepresentation.DocumentFromJson)(
    document,
  );
  return canonicalize(json, references);
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

function inspectAst(ast: SchemaAST.AST): {
  readonly transformations: ESchemaVersion['transformations'];
  readonly unverifiable: readonly SnapshotMarker[];
} {
  const transformations = new Map<
    string,
    ESchemaVersion['transformations'][number]
  >();
  const markers = new Map<string, SnapshotMarker>();
  walkAst(ast, (node, path) => {
    if (getComposition(node) !== undefined) return false;
    for (const link of node.encoding ?? []) {
      const transformation = link.transformation;
      if (isCompositionPlumbing(transformation)) continue;
      const name = allowedTransformations.get(transformation);
      if (name === undefined) {
        const markerPath = path || '/';
        markers.set(`transformation:${markerPath}`, {
          path: markerPath,
          kind: 'transformation',
          message:
            'Transformation behavior cannot be verified from snapshot data',
        });
      } else {
        const transformationPath = path || '/';
        transformations.set(`${transformationPath}:${name}`, {
          path: transformationPath,
          name,
        });
      }
    }
    if (node.context?.defaultValue !== undefined) {
      const markerPath = path || '/';
      markers.set(`default:${markerPath}`, {
        path: markerPath,
        kind: 'default',
        message:
          'Default-producing behavior cannot be verified from snapshot data',
      });
    }
    if (node._tag === 'Declaration') {
      const constructor = node.annotations?.typeConstructor;
      let serializable =
        isRecord(constructor) &&
        builtInDeclarationTags.has(String(constructor._tag));
      try {
        serializable =
          serializable && JSON.stringify(constructor) !== undefined;
      } catch {
        serializable = false;
      }
      if (!serializable) {
        const markerPath = path || '/';
        markers.set(`declaration:${markerPath}`, {
          path: markerPath,
          kind: 'declaration',
          message: 'Declaration behavior cannot be verified from snapshot data',
        });
      }
    }
    for (const check of node.checks ?? []) {
      const meta = (check.annotations as { meta?: unknown } | undefined)?.meta;
      if (!isRecord(meta) || !builtInCheckTags.has(String(meta._tag))) {
        const markerPath = path || '/';
        markers.set(`filter:${markerPath}`, {
          path: markerPath,
          kind: 'filter',
          message: 'Filter behavior cannot be verified from snapshot data',
        });
      }
    }
  });
  return {
    transformations: [...transformations.values()].sort((a, b) =>
      compareStrings(`${a.path}:${a.name}`, `${b.path}:${b.name}`),
    ),
    unverifiable: [...markers.values()].sort((a, b) =>
      compareStrings(`${a.path}:${a.kind}`, `${b.path}:${b.kind}`),
    ),
  };
}

function collectCompositions(ast: SchemaAST.AST): readonly {
  readonly eschema: object;
  readonly identity: string;
}[] {
  const found = new Map<object, { eschema: object; identity: string }>();
  walkAst(ast, (node) => {
    const metadata = getComposition(node);
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
  const info = inspectAst(evolution.schema.ast);
  if (kind === 'value') {
    return {
      version: evolution.version,
      encoded: representation(
        Schema.toEncoded(
          Schema.Struct({
            _v: Schema.Literal(evolution.version),
            value: evolution.schema,
          }),
        ),
        references,
      ),
      decoded: representation(Schema.toType(evolution.schema), references),
      ...info,
    };
  }
  const fields = (evolution.schema as Schema.Struct<any>).fields;
  return {
    version: evolution.version,
    encoded: representation(
      Schema.toEncoded(
        Schema.Struct({ ...fields, _v: Schema.Literal(evolution.version) }),
      ),
      references,
    ),
    decoded: representation(Schema.toType(evolution.schema), references),
    ...info,
  };
}

/** Builds canonical, deduplicated definitions for one or more ESchema roots. */
export function buildESchemaDefinitions(
  roots: readonly SnapshotESchemaRoot[],
): readonly ESchemaDefinition[] {
  const identityObjects = new Map<string, object>();
  const objectIdentities = new Map<object, string>();
  const pending = [...roots];
  const entries: {
    eschema: ESchemaLike;
    identity: string;
    evolutions: ReturnType<ESchemaLike['__snapshotEvolutions']>;
  }[] = [];

  while (pending.length > 0) {
    const next = pending.shift()!;
    const eschema = next.eschema as ESchemaLike;
    const identity = next.identity ?? eschema.name;
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
    const evolutions = eschema.__snapshotEvolutions();
    entries.push({ eschema, identity, evolutions });
    for (const evolution of evolutions) {
      for (const child of collectCompositions(evolution.schema.ast)) {
        pending.push(child);
      }
    }
  }

  const referenceNames = new Map<string, string>();
  for (const { identity } of entries) {
    referenceNames.set(`ESchema(${identity})`, identity);
    referenceNames.set(`ValueESchema(${identity})`, identity);
  }
  return entries
    .map(({ eschema, identity, evolutions }) => ({
      identity,
      kind: eschema.__snapshotKind,
      idField: eschema.idField ?? null,
      versions: evolutions.map((evolution) =>
        versionSnapshot(evolution, eschema.__snapshotKind, referenceNames),
      ),
    }))
    .sort((a, b) => compareStrings(a.identity, b.identity));
}

/** Creates an ESchema contract snapshot for a directly snapshotted root. */
export function snapshotESchema(
  eschema: object,
  identity: string,
): ESchemaSnapshot {
  return {
    _v: 'v1',
    kind: 'eschema',
    root: identity,
    schemas: buildESchemaDefinitions([{ eschema, identity }]),
  };
}
