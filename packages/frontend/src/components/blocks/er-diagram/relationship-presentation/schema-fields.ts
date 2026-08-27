type JsonRecord = Record<string, unknown>;

export interface PresentedField {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly referenceTarget?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function persistedValue(value: unknown): unknown {
  return isRecord(value) && 'type' in value && 'value' in value
    ? value.value
    : value;
}

function literal(value: unknown): string {
  const output = JSON.stringify(value);
  return output === undefined ? String(value) : output;
}

function checksSuffix(value: JsonRecord): string {
  if (!Array.isArray(value.checks) || value.checks.length === 0) return '';
  return ' constrained';
}

function unionTypes(value: JsonRecord): readonly unknown[] {
  return Array.isArray(value.types) ? value.types : [];
}

function formatUnion(value: JsonRecord): string {
  const types = [...new Set(unionTypes(value).map(formatSchemaType))];
  types.sort((left, right) => {
    if (left === 'null') return -1;
    if (right === 'null') return 1;
    return 0;
  });
  return types.length === 0 ? 'union' : types.join(' | ');
}

export function formatSchemaType(value: unknown): string {
  if (!isRecord(value)) return literal(value);
  if (value._tag === 'ESchemaRef' && typeof value.identity === 'string') {
    return value.identity;
  }

  const suffix = checksSuffix(value);
  switch (value._tag) {
    case 'String':
      return `string${suffix}`;
    case 'Number':
      return `number${suffix}`;
    case 'Boolean':
      return `boolean${suffix}`;
    case 'BigInt':
      return `bigint${suffix}`;
    case 'Symbol':
      return 'symbol';
    case 'Undefined':
      return 'undefined';
    case 'Void':
      return 'void';
    case 'Never':
      return 'never';
    case 'Unknown':
      return 'unknown';
    case 'Any':
      return 'any';
    case 'Literal':
      return literal(persistedValue(value.literal));
    case 'Union':
      return formatUnion(value);
    case 'Arrays': {
      const elements = Array.isArray(value.elements) ? value.elements : [];
      const rest = Array.isArray(value.rest) ? value.rest : [];
      if (elements.length === 0 && rest.length === 1) {
        return `${formatSchemaType(rest[0])}[]`;
      }
      return `[${[...elements, ...rest].map(formatSchemaType).join(', ')}]`;
    }
    case 'Objects':
      return 'complex';
    case 'Declaration': {
      const constructor = isRecord(value.annotations)
        ? value.annotations.typeConstructor
        : undefined;
      return isRecord(constructor) && typeof constructor._tag === 'string'
        ? constructor._tag
        : 'declaration';
    }
    default:
      return typeof value._tag === 'string' ? value._tag : 'unknown';
  }
}

function entityReference(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = entityReference(item);
      if (target !== undefined) return target;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  if (isRecord(value.annotations)) {
    const target = persistedValue(value.annotations.entityReference);
    if (typeof target === 'string' && target.length > 0) return target;
  }

  for (const child of Object.values(value)) {
    const target = entityReference(child);
    if (target !== undefined) return target;
  }
  return undefined;
}

function objectRepresentation(value: unknown): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  const representation =
    'representation' in value ? value.representation : value;
  return isRecord(representation) && representation._tag === 'Objects'
    ? representation
    : undefined;
}

function propertyName(property: JsonRecord): string | undefined {
  const value = persistedValue(property.name);
  return typeof value === 'string' ? value : undefined;
}

function fieldsIn(representation: JsonRecord): readonly PresentedField[] {
  const properties = Array.isArray(representation.propertySignatures)
    ? representation.propertySignatures.filter(isRecord)
    : [];
  const fields: PresentedField[] = [];

  for (const property of properties) {
    const name = propertyName(property);
    if (name === undefined || name === '_v') continue;

    const target = entityReference(property.type);

    fields.push({
      name,
      type: formatSchemaType(property.type),
      optional: property.isOptional === true,
      ...(target === undefined ? {} : { referenceTarget: target }),
    });
  }
  return fields;
}

export function schemaFields(encoded: unknown): readonly PresentedField[] {
  const representation = objectRepresentation(encoded);
  return representation === undefined ? [] : fieldsIn(representation);
}
