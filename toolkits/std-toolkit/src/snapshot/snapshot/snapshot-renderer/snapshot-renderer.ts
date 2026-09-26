import type { SnapshotChange } from '../../domain/index.js';

type SnapshotImpact = SnapshotChange['impact'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function literal(value: unknown): string {
  const output = JSON.stringify(value);
  return output === undefined ? String(value) : output;
}

function persistentValue(value: unknown): unknown {
  return isRecord(value) && 'type' in value && 'value' in value
    ? value.value
    : value;
}

function checkNames(value: Record<string, unknown>): string {
  if (!Array.isArray(value.checks) || value.checks.length === 0) return '';
  const names = value.checks.map((check) => {
    if (!isRecord(check)) return 'constraint';
    if (isRecord(check.meta) && typeof check.meta._tag === 'string') {
      return check.meta._tag;
    }
    return typeof check._tag === 'string' ? check._tag : 'constraint';
  });
  return ` · ${names.join(', ')}`;
}

function inlineType(value: unknown, depth = 0): string {
  if (!isRecord(value)) return literal(value);
  if (value._tag === 'ESchemaRef' && typeof value.identity === 'string') {
    return value.identity;
  }
  const suffix = checkNames(value);
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
      return literal(persistentValue(value.literal));
    case 'Union':
      return Array.isArray(value.types)
        ? value.types.map((item) => inlineType(item, depth + 1)).join(' | ')
        : 'union';
    case 'Arrays': {
      const elements = Array.isArray(value.elements) ? value.elements : [];
      const rest = Array.isArray(value.rest) ? value.rest : [];
      if (elements.length === 0 && rest.length === 1) {
        return `${inlineType(rest[0], depth + 1)}[]`;
      }
      return `[${[...elements, ...rest].map((item) => inlineType(item, depth + 1)).join(', ')}]`;
    }
    case 'Objects': {
      if (depth > 1) return 'object';
      const properties = Array.isArray(value.propertySignatures)
        ? value.propertySignatures
        : [];
      return `{ ${properties
        .filter(isRecord)
        .map((property) => {
          const name = String(persistentValue(property.name));
          const optional = property.isOptional === true ? '?' : '';
          return `${name}${optional}: ${inlineType(property.type, depth + 1)}`;
        })
        .join('; ')} }`;
    }
    case 'Declaration': {
      const constructor = isRecord(value.annotations)
        ? value.annotations.typeConstructor
        : undefined;
      if (isRecord(constructor) && typeof constructor._tag === 'string') {
        return constructor._tag;
      }
      return 'declaration';
    }
    default:
      return typeof value._tag === 'string' ? value._tag : 'unknown';
  }
}

const impactOrder: readonly SnapshotImpact[] = [
  'breaking',
  'unverifiable',
  'requires-backfill',
  'safe',
];

const impactLabels: Record<SnapshotImpact, string> = {
  breaking: 'BREAKING',
  unverifiable: 'UNVERIFIABLE',
  'requires-backfill': 'BACKFILL',
  safe: 'SAFE',
};

function subjectLabel(change: SnapshotChange): string {
  const { subject } = change;
  switch (subject.kind) {
    case 'table':
      return `Table ${subject.name ?? ''}`.trim();
    case 'eschema':
      return `ESchema ${subject.name ?? ''}`.trim();
    case 'version':
      return `${subject.name ?? 'ESchema'} ${subject.version ?? ''}`.trim();
    case 'entity':
      return `Entity ${subject.name ?? ''}`.trim();
    case 'primary-index':
      return 'Primary index';
    case 'local-secondary-index':
      return `Local secondary index ${subject.name ?? ''}`.trim();
    case 'global-secondary-index':
      return `Global secondary index ${subject.name ?? ''}`.trim();
    case 'access-pattern':
      return `Access pattern ${[subject.owner, subject.name].filter(Boolean).join('/')}`;
  }
}

function valueLabel(value: unknown): string {
  if (value === undefined) return '—';
  if (isRecord(value) && typeof value._tag === 'string') {
    return inlineType(value);
  }
  if (Array.isArray(value)) return value.map(valueLabel).join(', ') || '—';
  return literal(value);
}

function editLine(edit: SnapshotChange['edits'][number]): string {
  const location = edit.path.join('.') || 'contract';
  return `${location}: ${valueLabel(edit.before)} → ${valueLabel(edit.after)}`;
}

function changeLines(change: SnapshotChange): readonly string[] {
  const subject = subjectLabel(change);
  if (change.action !== 'edited') return [`  ${subject} ${change.action}`];
  return [
    `  ${subject}`,
    ...change.edits.map((item) => `    ${editLine(item)}`),
  ];
}

export function renderSnapshotChanges(
  changes: readonly SnapshotChange[],
): string {
  const lines: string[] = [];
  for (const impact of impactOrder) {
    const classified = changes.filter((change) => change.impact === impact);
    if (classified.length === 0) continue;
    if (lines.length > 0) lines.push('');
    lines.push(impactLabels[impact]);
    classified.forEach((change, index) => {
      if (index > 0 && change.action === 'edited') lines.push('');
      lines.push(...changeLines(change));
    });
  }
  return lines.join('\n');
}
