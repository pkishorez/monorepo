import type {
  ContractSnapshot,
  ESchemaDefinition,
  SnapshotChange,
  SnapshotImpact,
} from '../../domain/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pad(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - value.length));
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
    return `${String(persistentValue(property.name))}${optional}: ${inlineType(property.type)}`;
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

  const secondaryIndexes = [
    ...snapshot.topology.localSecondaryIndexes.map((index) => ({
      ...index,
      kind: 'lsi',
    })),
    ...snapshot.topology.globalSecondaryIndexes.map((index) => ({
      ...index,
      kind: 'gsi',
    })),
  ];
  const lines = [
    ...titleBox('DATABASE CONTRACT', `Table: ${snapshot.logicalName}`),
    '',
    section('Primary index'),
    '',
    ...table(
      ['Key', 'Attribute'],
      [
        ['Partition key', snapshot.topology.primary.pk],
        ['Sort key', snapshot.topology.primary.sk],
      ],
    ),
    '',
    section('Secondary indexes'),
    '',
  ];
  if (secondaryIndexes.length === 0) lines.push('None');
  else
    lines.push(
      ...table(
        ['Name', 'Kind', 'Partition key', 'Sort key'],
        secondaryIndexes.map(({ name, kind, pk, sk }) => [name, kind, pk, sk]),
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
          entity.primary.pk.join(', ') || '—',
          entity.primary.sk.join(', ') || '—',
        ]),
      ),
    );

  const accessPatterns = snapshot.entities.flatMap((entity) =>
    entity.accessPatterns.map((pattern) => [
      entity.name,
      pattern.name,
      pattern.kind,
      pattern.index ?? '—',
      pattern.pk.join(', ') || '—',
      pattern.sk.join(', ') || '—',
    ]),
  );
  if (accessPatterns.length > 0) {
    lines.push(
      '',
      section('Access patterns'),
      '',
      ...table(
        ['Entity', 'Name', 'Kind', 'Index', 'PK source', 'SK source'],
        accessPatterns,
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
    case 'snapshot':
      return 'Snapshot';
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

function sideLabel(side: SnapshotChange['edits'][number]['side']): string {
  switch (side) {
    case 'encoded':
      return 'encoded';
    case 'decoded':
      return 'decoded';
    case 'encoded-and-decoded':
      return 'encoded and decoded';
    default:
      return '';
  }
}

function editLine(edit: SnapshotChange['edits'][number]): string {
  const location = edit.path.join('.') || 'contract';
  const side = sideLabel(edit.side);
  const qualifier = side.length === 0 ? '' : ` · ${side}`;
  return `${location}${qualifier}: ${valueLabel(edit.before)} → ${valueLabel(edit.after)}`;
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
