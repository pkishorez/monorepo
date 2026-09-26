import type { SnapshotCheck, SnapshotType } from 'std-toolkit/eschema';

/** One check on a field, ready to show: its name and a readable label. */
export interface PresentedCheck {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
}

export interface PresentedField {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly checks: readonly PresentedCheck[];
  readonly referenceTarget?: string;
  readonly complex?: PresentedComplexType;
}

export type PresentedNestedField = PresentedField;

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
      readonly kind: 'record';
      readonly value: PresentedComplexType;
    }
  | {
      readonly kind: 'union';
      readonly variants: readonly {
        readonly label: string;
        readonly type: PresentedComplexType;
      }[];
    };

function literal(value: unknown): string {
  const output = JSON.stringify(value);
  return output === undefined ? String(value) : output;
}

const checkWords: Record<Exclude<SnapshotCheck['check'], 'custom'>, string> = {
  minLength: 'min length',
  maxLength: 'max length',
  lengthBetween: 'length',
  pattern: 'pattern',
  uuid: 'UUID',
  int: 'integer',
  finite: 'finite',
  greaterThan: '>',
  greaterThanOrEqualTo: '≥',
  lessThan: '<',
  lessThanOrEqualTo: '≤',
  between: 'between',
};

function checkLabel(check: SnapshotCheck): string {
  switch (check.check) {
    case 'custom':
      return check.name;
    case 'minLength':
      return `${checkWords.minLength} ${check.minLength}`;
    case 'maxLength':
      return `${checkWords.maxLength} ${check.maxLength}`;
    case 'lengthBetween':
      return `${checkWords.lengthBetween} ${check.minimum}–${check.maximum}`;
    case 'pattern':
      return `${checkWords.pattern} /${check.source}/${check.flags}`;
    case 'uuid':
      return check.version === undefined
        ? checkWords.uuid
        : `${checkWords.uuid} v${check.version}`;
    case 'greaterThan':
      return `${checkWords.greaterThan} ${check.exclusiveMinimum}`;
    case 'greaterThanOrEqualTo':
      return `${checkWords.greaterThanOrEqualTo} ${check.minimum}`;
    case 'lessThan':
      return `${checkWords.lessThan} ${check.exclusiveMaximum}`;
    case 'lessThanOrEqualTo':
      return `${checkWords.lessThanOrEqualTo} ${check.maximum}`;
    case 'between':
      return `${checkWords.between} ${check.minimum}${check.exclusiveMinimum ? ' (exclusive)' : ''} and ${check.maximum}${check.exclusiveMaximum ? ' (exclusive)' : ''}`;
    default:
      return checkWords[check.check];
  }
}

function presentCheck(check: SnapshotCheck): PresentedCheck {
  const name = check.check === 'custom' ? check.name : check.check;
  return {
    name,
    label: checkLabel(check),
    ...(check.check === 'custom' && check.description !== undefined
      ? { description: check.description }
      : {}),
  };
}

function checksOf(shape: SnapshotType): readonly PresentedCheck[] {
  return 'checks' in shape && shape.checks !== undefined
    ? shape.checks.map(presentCheck)
    : [];
}

function referenceOf(shape: SnapshotType): string | undefined {
  return 'entityReference' in shape ? shape.entityReference : undefined;
}

function isComplexShape(shape: SnapshotType): boolean {
  switch (shape.type) {
    case 'struct':
      return true;
    case 'union':
      return shape.members.some(isComplexShape);
    case 'array':
    case 'record':
      return isComplexShape(
        shape.type === 'array' ? shape.element : shape.value,
      );
    case 'recursive':
      return true;
    default:
      return false;
  }
}

function formatUnion(members: readonly SnapshotType[]): string {
  if (members.some(isComplexShape)) return 'complex';
  const types = [...new Set(members.map(formatSchemaType))];
  types.sort((left, right) => {
    if (left === 'null') return -1;
    if (right === 'null') return 1;
    return 0;
  });
  return types.join(' | ');
}

export function formatSchemaType(shape: SnapshotType): string {
  switch (shape.type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'unknown':
      return shape.type;
    case 'literal':
      return literal(shape.value);
    case 'ref':
      return shape.identity;
    case 'union':
      return formatUnion(shape.members);
    case 'array':
      return `${formatSchemaType(shape.element)}[]`;
    case 'record':
      return `Record<${formatSchemaType(shape.value)}>`;
    case 'struct':
    case 'recursive':
      return 'complex';
    case 'recurse':
      return 'recursive';
  }
}

function variantLabel(shape: SnapshotType, index: number): string {
  if (shape.type === 'struct') {
    const discriminator = shape.fields.find(
      ({ name }) => name === 'kind' || name === 'type',
    );
    if (discriminator !== undefined) {
      return formatSchemaType(discriminator.type).replace(/^"|"$/g, '');
    }
  }
  const formatted = formatSchemaType(shape);
  return formatted === 'complex' ? `Variant ${index + 1}` : formatted;
}

function leafType(shape: SnapshotType): PresentedComplexType {
  const referenceTarget = referenceOf(shape);
  return {
    kind: 'type',
    type: formatSchemaType(shape),
    ...(referenceTarget === undefined ? {} : { referenceTarget }),
  };
}

function complexType(shape: SnapshotType): PresentedComplexType | undefined {
  switch (shape.type) {
    case 'struct':
      return { kind: 'object', fields: shape.fields.map(presentField) };
    case 'recursive':
      return complexType(shape.body);
    case 'array': {
      const element = complexType(shape.element);
      return element === undefined ? undefined : { kind: 'array', element };
    }
    case 'record': {
      const value = complexType(shape.value);
      return value === undefined ? undefined : { kind: 'record', value };
    }
    case 'union':
      return {
        kind: 'union',
        variants: shape.members.map((member, index) => ({
          label: variantLabel(member, index),
          type: complexType(member) ?? leafType(member),
        })),
      };
    default:
      return undefined;
  }
}

/** The one Entity a field identifies, through an array or a nullable union. */
function fieldReference(shape: SnapshotType): string | undefined {
  const direct = referenceOf(shape);
  if (direct !== undefined) return direct;
  const targets =
    shape.type === 'array'
      ? [fieldReference(shape.element)]
      : shape.type === 'union'
        ? shape.members.map(fieldReference)
        : [];
  const found = targets.filter((target) => target !== undefined);
  return new Set(found).size === 1 ? found[0] : undefined;
}

function presentField(field: {
  readonly name: string;
  readonly optional?: true;
  readonly type: SnapshotType;
}): PresentedField {
  const referenceTarget = fieldReference(field.type);
  const complex = complexType(field.type);
  return {
    name: field.name,
    type: formatSchemaType(field.type),
    optional: field.optional === true,
    checks: checksOf(field.type),
    ...(referenceTarget === undefined ? {} : { referenceTarget }),
    ...(complex === undefined ? {} : { complex }),
  };
}

function referencesInComplex(complex: PresentedComplexType): readonly string[] {
  switch (complex.kind) {
    case 'type':
      return complex.referenceTarget === undefined
        ? []
        : [complex.referenceTarget];
    case 'array':
      return referencesInComplex(complex.element);
    case 'record':
      return referencesInComplex(complex.value);
    case 'union':
      return complex.variants.flatMap(({ type }) => referencesInComplex(type));
    case 'object':
      return complex.fields.flatMap(fieldReferenceTargets);
  }
}

export function fieldReferenceTargets(
  field: PresentedField,
): readonly string[] {
  return [
    ...(field.referenceTarget === undefined ? [] : [field.referenceTarget]),
    ...(field.complex === undefined ? [] : referencesInComplex(field.complex)),
  ];
}

/** The fields of a version's stored shape; a value ESchema has none to list. */
export function schemaFields(
  shape: SnapshotType | undefined,
): readonly PresentedField[] {
  return shape?.type === 'struct' ? shape.fields.map(presentField) : [];
}
