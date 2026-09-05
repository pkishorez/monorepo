type JsonRecord = Record<string, unknown>;

export interface PresentedField {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly referenceTarget?: string;
  readonly complex?: PresentedComplexType;
}

export interface PresentedNestedField {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly referenceTarget?: string;
  readonly complex?: PresentedComplexType;
}

export type PresentedComplexType =
  | {
      readonly kind: 'type';
      readonly type: string;
      readonly referenceTarget?: string;
    }
  | {
      readonly kind: 'object';
      readonly fields: readonly PresentedNestedField[];
    }
  | {
      readonly kind: 'array';
      readonly element: PresentedComplexType;
    }
  | {
      readonly kind: 'tuple';
      readonly elements: readonly PresentedComplexType[];
      readonly rest: readonly PresentedComplexType[];
    }
  | {
      readonly kind: 'union';
      readonly variants: readonly {
        readonly label: string;
        readonly type: PresentedComplexType;
      }[];
    };

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

function directAnnotation(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.annotations)) return undefined;
  const target = persistedValue(value.annotations.entityReference);
  return typeof target === 'string' && target.length > 0 ? target : undefined;
}

function propertiesIn(representation: JsonRecord): readonly JsonRecord[] {
  return Array.isArray(representation.propertySignatures)
    ? representation.propertySignatures.filter(isRecord)
    : [];
}

function variantLabel(value: unknown, index: number): string {
  const representation = objectRepresentation(value);
  const discriminator =
    representation === undefined
      ? undefined
      : propertiesIn(representation).find((property) => {
          const name = propertyName(property);
          return name === 'kind' || name === 'type';
        });
  if (discriminator !== undefined) {
    return formatSchemaType(discriminator.type).replace(/^"|"$/g, '');
  }
  const formatted = formatSchemaType(value);
  return formatted === 'complex' ? `Variant ${index + 1}` : formatted;
}

function leafType(value: unknown): PresentedComplexType {
  const referenceTarget = directAnnotation(value);
  return {
    kind: 'type',
    type: formatSchemaType(value),
    ...(referenceTarget === undefined ? {} : { referenceTarget }),
  };
}

function complexType(value: unknown): PresentedComplexType | undefined {
  const representation = objectRepresentation(value);
  if (representation !== undefined) {
    return { kind: 'object', fields: nestedFields(representation) };
  }
  if (!isRecord(value)) return undefined;

  if (value._tag === 'Arrays') {
    const elements = Array.isArray(value.elements) ? value.elements : [];
    const rest = Array.isArray(value.rest) ? value.rest : [];
    if (elements.length !== 0 || rest.length > 1) {
      return {
        kind: 'tuple',
        elements: elements.map(
          (element) => complexType(element) ?? leafType(element),
        ),
        rest: rest.map((element) => complexType(element) ?? leafType(element)),
      };
    }
    if (rest.length !== 1) return undefined;
    const element = complexType(rest[0]);
    return element === undefined ? undefined : { kind: 'array', element };
  }

  if (value._tag === 'Union') {
    const types = unionTypes(value);
    const variants = types.map((item, index) => ({
      label: variantLabel(item, index),
      type: complexType(item) ?? leafType(item),
    }));
    return { kind: 'union', variants };
  }

  return undefined;
}

function fieldReference(value: unknown): string | undefined {
  const annotation = directAnnotation(value);
  if (annotation !== undefined) return annotation;
  if (!isRecord(value) || objectRepresentation(value) !== undefined) {
    return undefined;
  }
  if (value._tag === 'Arrays') {
    const elements = Array.isArray(value.elements) ? value.elements : [];
    const rest = Array.isArray(value.rest) ? value.rest : [];
    const targets = [...elements, ...rest]
      .map(fieldReference)
      .filter((target): target is string => target !== undefined);
    return new Set(targets).size === 1 ? targets[0] : undefined;
  }
  if (value._tag === 'Union') {
    const targets = unionTypes(value)
      .map(fieldReference)
      .filter((target): target is string => target !== undefined);
    return new Set(targets).size === 1 ? targets[0] : undefined;
  }
  return undefined;
}

function nestedFields(
  representation: JsonRecord,
): readonly PresentedNestedField[] {
  return propertiesIn(representation).flatMap((property) => {
    const name = propertyName(property);
    if (name === undefined) return [];
    const referenceTarget = fieldReference(property.type);
    const complex = complexType(property.type);
    return [
      {
        name,
        type: formatSchemaType(property.type),
        optional: property.isOptional === true,
        ...(referenceTarget === undefined ? {} : { referenceTarget }),
        ...(complex === undefined ? {} : { complex }),
      },
    ];
  });
}

function fieldsIn(representation: JsonRecord): readonly PresentedField[] {
  const properties = propertiesIn(representation);
  const fields: PresentedField[] = [];

  for (const property of properties) {
    const name = propertyName(property);
    if (name === undefined || name === '_v') continue;

    const target = fieldReference(property.type);
    const complex = complexType(property.type);

    fields.push({
      name,
      type: formatSchemaType(property.type),
      optional: property.isOptional === true,
      ...(target === undefined ? {} : { referenceTarget: target }),
      ...(complex === undefined ? {} : { complex }),
    });
  }
  return fields;
}

function referencesInComplex(complex: PresentedComplexType): readonly string[] {
  if (complex.kind === 'type') {
    return complex.referenceTarget === undefined
      ? []
      : [complex.referenceTarget];
  }
  if (complex.kind === 'array') return referencesInComplex(complex.element);
  if (complex.kind === 'tuple') {
    return [
      ...complex.elements.flatMap(referencesInComplex),
      ...complex.rest.flatMap(referencesInComplex),
    ];
  }
  if (complex.kind === 'union') {
    return complex.variants.flatMap(({ type }) => referencesInComplex(type));
  }
  return complex.fields.flatMap((field) => [
    ...(field.referenceTarget === undefined ? [] : [field.referenceTarget]),
    ...(field.complex === undefined ? [] : referencesInComplex(field.complex)),
  ]);
}

export function fieldReferenceTargets(
  field: PresentedField,
): readonly string[] {
  return [
    ...(field.referenceTarget === undefined ? [] : [field.referenceTarget]),
    ...(field.complex === undefined ? [] : referencesInComplex(field.complex)),
  ];
}

export function schemaFields(encoded: unknown): readonly PresentedField[] {
  const representation = objectRepresentation(encoded);
  return representation === undefined ? [] : fieldsIn(representation);
}
