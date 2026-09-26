import type { SnapshotCheck, SnapshotType } from '../../../eschema/index.js';
import type { SnapshotChange } from '../../domain/index.js';

type SnapshotImpact = SnapshotChange['impact'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function literal(value: unknown): string {
  const output = JSON.stringify(value);
  return output === undefined ? String(value) : output;
}

function checkLabel(check: SnapshotCheck): string {
  const { check: name, ...args } = check;
  if (check.check === 'custom') return check.name;
  const values = Object.values(args).map((value) => literal(value));
  return values.length === 0 ? name : `${name}(${values.join(', ')})`;
}

function checkSuffix(shape: SnapshotType): string {
  const checks = 'checks' in shape ? shape.checks : undefined;
  const reference =
    'entityReference' in shape && shape.entityReference !== undefined
      ? ` → ${shape.entityReference}`
      : '';
  return checks === undefined || checks.length === 0
    ? reference
    : `${reference} · ${checks.map(checkLabel).join(', ')}`;
}

function inlineType(shape: SnapshotType, depth = 0): string {
  const suffix = checkSuffix(shape);
  switch (shape.type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'unknown':
      return `${shape.type}${suffix}`;
    case 'literal':
      return `${literal(shape.value)}${suffix}`;
    case 'ref':
      return shape.identity;
    case 'recursive':
      return `recursive ${inlineType(shape.body, depth)}`;
    case 'recurse':
      return `recurse(${shape.depth})`;
    case 'union':
      return `${shape.members.map((member) => inlineType(member, depth + 1)).join(' | ')}${suffix}`;
    case 'array': {
      const element = inlineType(shape.element, depth + 1);
      return `${shape.element.type === 'union' ? `(${element})` : element}[]${suffix}`;
    }
    case 'record':
      return `Record<string, ${inlineType(shape.value, depth + 1)}>${suffix}`;
    case 'struct':
      if (depth > 1) return `object${suffix}`;
      return `{ ${shape.fields
        .map(
          (field) =>
            `${field.name}${field.optional ? '?' : ''}: ${inlineType(field.type, depth + 1)}`,
        )
        .join('; ')} }${suffix}`;
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
  if (isRecord(value) && typeof value.type === 'string') {
    return inlineType(value as unknown as SnapshotType);
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
