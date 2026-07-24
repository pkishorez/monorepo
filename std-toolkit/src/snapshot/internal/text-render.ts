import type {
  ContractSnapshot,
  ESchemaDefinition,
  SnapshotChange,
  SnapshotClassification,
} from '../model.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pad(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - value.length));
}

function indent(lines: readonly string[], spaces: number): readonly string[] {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => (line.length === 0 ? '' : `${prefix}${line}`));
}

function section(title: string): string {
  return title.toUpperCase();
}

function titleBox(title: string, subtitle: string): readonly string[] {
  const width = Math.max(48, title.length + 3, subtitle.length + 2);
  const heading = `─ ${title} `;
  return [
    `╭${heading}${'─'.repeat(width - heading.length)}╮`,
    `│ ${pad(subtitle, width - 2)} │`,
    `╰${'─'.repeat(width)}╯`,
  ];
}

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): readonly string[] {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const border = (left: string, middle: string, right: string): string =>
    `${left}${widths.map((width) => '─'.repeat(width + 2)).join(middle)}${right}`;
  const row = (values: readonly string[]): string =>
    `│ ${widths.map((width, index) => pad(values[index] ?? '', width)).join(' │ ')} │`;
  return [
    border('┌', '┬', '┐'),
    row(headers),
    border('├', '┼', '┤'),
    ...rows.map(row),
    border('└', '┴', '┘'),
  ];
}

function literal(value: unknown): string {
  const output = JSON.stringify(value);
  return output === undefined ? String(value) : output;
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
      return literal(value.literal);
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
          const name = String(property.name);
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

function representationLines(value: unknown): readonly string[] {
  const representation =
    isRecord(value) && 'representation' in value ? value.representation : value;
  if (!isRecord(representation) || representation._tag !== 'Objects') {
    return [inlineType(representation)];
  }
  const properties = Array.isArray(representation.propertySignatures)
    ? representation.propertySignatures.filter(isRecord)
    : [];
  if (properties.length === 0) return ['{}'];
  return properties.map((property) => {
    const optional = property.isOptional === true ? '?' : '';
    return `${String(property.name)}${optional}: ${inlineType(property.type)}`;
  });
}

function transformationPath(path: string): string {
  const properties = path
    .split('/')
    .flatMap((part, index, values) =>
      values[index - 1] === 'properties'
        ? [part.replaceAll('~1', '/').replaceAll('~0', '~')]
        : [],
    );
  return properties.length > 0 ? properties.join('.') : path;
}

function renderDefinitions(
  definitions: readonly ESchemaDefinition[],
): readonly string[] {
  const lines: string[] = [];
  definitions.forEach((definition, definitionIndex) => {
    if (definitionIndex > 0) lines.push('');
    lines.push(
      `${definition.identity} · ${definition.kind}${definition.idField === null ? '' : ` · identity: ${definition.idField}`}`,
    );
    definition.versions.forEach((version, versionIndex) => {
      const versionLast = versionIndex === definition.versions.length - 1;
      const versionBranch = versionLast ? '└─' : '├─';
      const continuation = versionLast ? '   ' : '│  ';
      lines.push(`${versionBranch} ${version.version}`);
      const blocks: {
        readonly title: string;
        readonly values: readonly string[];
      }[] = [
        { title: 'encoded', values: representationLines(version.encoded) },
        { title: 'decoded', values: representationLines(version.decoded) },
      ];
      if (version.transformations.length > 0) {
        blocks.push({
          title: 'transformations',
          values: version.transformations.map(
            ({ path, name }) => `${transformationPath(path)}: ${name}`,
          ),
        });
      }
      if (version.unverifiable.length > 0) {
        blocks.push({
          title: 'unverifiable',
          values: version.unverifiable.map(
            ({ path, kind }) => `${transformationPath(path)}: ${kind}`,
          ),
        });
      }
      blocks.forEach((block, blockIndex) => {
        const blockLast = blockIndex === blocks.length - 1;
        const branch = blockLast ? '└─' : '├─';
        const child = blockLast ? '   ' : '│  ';
        lines.push(`${continuation}${branch} ${block.title}`);
        block.values.forEach((value, valueIndex) => {
          const valueBranch =
            valueIndex === block.values.length - 1 ? '└─' : '├─';
          lines.push(`${continuation}${child}${valueBranch} ${value}`);
        });
      });
    });
  });
  return lines;
}

export function renderSnapshot(snapshot: ContractSnapshot): string {
  if (snapshot.kind === 'eschema') {
    return [
      ...titleBox('DATABASE CONTRACT', `ESchema root: ${snapshot.root}`),
      '',
      section('Schemas'),
      '',
      ...renderDefinitions(snapshot.schemas),
    ].join('\n');
  }

  const lines = [
    ...titleBox('DATABASE CONTRACT', `Table: ${snapshot.adapter}`),
    '',
    section('Primary index'),
    '',
    ...table(
      ['Key', 'Attribute'],
      [
        ['Partition key', snapshot.primaryIndex.pk],
        ['Sort key', snapshot.primaryIndex.sk],
      ],
    ),
    '',
    section('Secondary indexes'),
    '',
  ];
  if (snapshot.secondaryIndexes.length === 0) lines.push('None');
  else
    lines.push(
      ...table(
        ['Name', 'Kind', 'Partition key', 'Sort key'],
        snapshot.secondaryIndexes.map(({ name, kind, pk, sk }) => [
          name,
          kind,
          pk,
          sk,
        ]),
      ),
    );

  lines.push('', section('Entities'), '');
  if (snapshot.entities.length === 0) lines.push('None');
  else
    lines.push(
      ...table(
        ['Name', 'Kind', 'Schema', 'Identity', 'Primary PK', 'Primary SK'],
        snapshot.entities.map((entity) => [
          entity.name,
          entity.kind,
          entity.schema,
          entity.idField ?? '—',
          entity.primaryDerivation.pk.join(', ') || '—',
          entity.primaryDerivation.sk.join(', ') || '—',
        ]),
      ),
    );

  const entityIndexes = snapshot.entities.flatMap((entity) =>
    entity.secondaryDerivations.map((derivation) => [
      entity.name,
      derivation.name,
      derivation.physicalIndex,
      derivation.pk.join(', ') || '—',
      derivation.sk.join(', ') || '—',
    ]),
  );
  if (entityIndexes.length > 0) {
    lines.push(
      '',
      section('Entity indexes'),
      '',
      ...table(
        ['Entity', 'Name', 'Physical', 'PK source', 'SK source'],
        entityIndexes,
      ),
    );
  }
  if (snapshot.schemas.length > 0) {
    lines.push(
      '',
      section('Schemas'),
      '',
      ...renderDefinitions(snapshot.schemas),
    );
  }
  return lines.join('\n');
}

const classificationOrder: readonly SnapshotClassification[] = [
  'breaking',
  'requires-backfill',
  'unverifiable',
  'safe',
];

const classificationLabels: Record<SnapshotClassification, string> = {
  breaking: '✕ BREAKING',
  'requires-backfill': '◇ BACKFILL',
  unverifiable: '? UNVERIFIABLE',
  safe: '✓ SAFE',
};

function shortValue(value: unknown): string {
  if (value === undefined) return '—';
  if (
    value === null ||
    ['string', 'number', 'boolean'].includes(typeof value)
  ) {
    return String(value);
  }
  return Array.isArray(value) ? value.map(String).join(', ') : 'changed';
}

function summaryValue(
  change: SnapshotChange,
  side: 'before' | 'after',
): string {
  const value = change[side];
  if (value === undefined) return side === 'before' ? '—' : 'removed';
  if (isRecord(value) && side === 'after' && change.before === undefined) {
    return 'added';
  }
  return shortValue(value);
}

const detailLabels: Readonly<Record<string, string>> = {
  name: 'Name',
  kind: 'Kind',
  physicalIndex: 'Physical index',
  pk: 'Partition key',
  sk: 'Sort key',
  schema: 'Schema',
  idField: 'Identity',
  version: 'Version',
};

function recordRows(value: Record<string, unknown>): readonly string[][] {
  return Object.entries(detailLabels).flatMap(([key, label]) => {
    const item = value[key];
    if (item === undefined) return [];
    if (Array.isArray(item)) return [[label, item.join(', ') || '—']];
    if (
      item === null ||
      ['string', 'number', 'boolean'].includes(typeof item)
    ) {
      return [[label, String(item ?? '—')]];
    }
    return [];
  });
}

function renderRecord(value: Record<string, unknown>): readonly string[] {
  const rows = recordRows(value);
  const lines = rows.length === 0 ? [] : [...table(['Field', 'Value'], rows)];
  if ('encoded' in value) {
    if (lines.length > 0) lines.push('');
    lines.push(
      'Encoded',
      ...representationLines(value.encoded).map((line) => `  ${line}`),
    );
  }
  if ('decoded' in value) {
    if (lines.length > 0) lines.push('');
    lines.push(
      'Decoded',
      ...representationLines(value.decoded).map((line) => `  ${line}`),
    );
  }
  return lines;
}

function detailLines(change: SnapshotChange): readonly string[] {
  const lines = [`  ${change.message}`, `  ${change.path}`];
  if (change.before !== undefined || change.after !== undefined) {
    if (isRecord(change.before) || isRecord(change.after)) {
      const before = isRecord(change.before) ? renderRecord(change.before) : [];
      const after = isRecord(change.after) ? renderRecord(change.after) : [];
      if (before.length > 0) {
        lines.push('', '  Before', ...indent(before, 4));
      }
      if (after.length > 0) {
        lines.push('', '  After', ...indent(after, 4));
      }
      if (before.length === 0 && after.length === 0) {
        lines.push(
          `    before  ${change.before === undefined ? '—' : 'present'}`,
          `    after   ${change.after === undefined ? '—' : 'present'}`,
        );
      }
    } else {
      lines.push(
        '',
        ...table(
          ['', 'Value'],
          [
            ['Before', shortValue(change.before)],
            ['After', shortValue(change.after)],
          ],
        ).map((line) => `  ${line}`),
      );
    }
  }
  return lines;
}

export function renderSnapshotChanges(
  changes: readonly SnapshotChange[],
): string {
  if (changes.length === 0) {
    return '✓ Database contract matches the approved snapshot';
  }
  const counts = classificationOrder
    .map((classification) => {
      const count = changes.filter(
        (change) => change.classification === classification,
      ).length;
      return count === 0 ? undefined : `${count} ${classification}`;
    })
    .filter((value): value is string => value !== undefined)
    .join(' · ');
  const lines = [
    ...titleBox('DATABASE CONTRACT CHANGED', counts),
    '',
    ...table(
      ['Status', 'Change', 'Before', 'After'],
      [...changes]
        .sort(
          (a, b) =>
            classificationOrder.indexOf(a.classification) -
              classificationOrder.indexOf(b.classification) ||
            a.path.localeCompare(b.path),
        )
        .map((change) => [
          classificationLabels[change.classification],
          change.message,
          summaryValue(change, 'before'),
          summaryValue(change, 'after'),
        ]),
    ),
  ];
  for (const classification of classificationOrder) {
    const classified = changes.filter(
      (change) => change.classification === classification,
    );
    if (classified.length === 0) continue;
    lines.push('', section(classificationLabels[classification].slice(2)), '');
    classified.forEach((change, index) => {
      if (index > 0) lines.push('');
      lines.push(...detailLines(change));
    });
  }
  return lines.join('\n');
}
