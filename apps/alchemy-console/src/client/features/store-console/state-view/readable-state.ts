export type ReadableScalar = string | number | boolean | null;

export type ReadableNode =
  | { kind: 'empty' }
  | { kind: 'scalar'; value: ReadableScalar; url: boolean }
  | { kind: 'fields'; fields: ReadonlyArray<ReadableField> }
  | { kind: 'list'; items: ReadonlyArray<ReadableNode> }
  | {
      kind: 'table';
      columns: ReadonlyArray<{ key: string; label: string }>;
      rows: ReadonlyArray<Readonly<Record<string, ReadableScalar>>>;
    };

export type ReadableField = {
  key: string;
  label: string;
  value: ReadableNode;
};

export type StateDetails = {
  kind: 'resource' | 'action';
  metadata: ReadonlyArray<{ label: string; value: ReadableScalar }>;
  sections: ReadonlyArray<{ title: string; value: ReadableNode }>;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = (value: unknown): value is ReadableScalar =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

export function readableLabel(key: string): string {
  const words = key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : key;
}

const isUrl = (value: ReadableScalar) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const table = (items: ReadonlyArray<unknown>): ReadableNode | null => {
  if (items.length === 0 || !items.every(record)) return null;
  const keys = [...new Set(items.flatMap((item) => Object.keys(item)))];
  if (
    keys.length === 0 ||
    keys.length > 6 ||
    !items.every((item) => keys.every((key) => scalar(item[key])))
  )
    return null;
  return {
    kind: 'table',
    columns: keys.map((key) => ({ key, label: readableLabel(key) })),
    rows: items.map((item) => item as Record<string, ReadableScalar>),
  };
};

export function toReadableNode(value: unknown): ReadableNode {
  if (value === undefined) return { kind: 'empty' };
  if (scalar(value)) return { kind: 'scalar', value, url: isUrl(value) };
  if (Array.isArray(value)) {
    const asTable = table(value);
    return (asTable ?? {
      kind: value.length === 0 ? 'empty' : 'list',
      ...(value.length === 0
        ? {}
        : { items: value.map((item) => toReadableNode(item)) }),
    }) as ReadableNode;
  }
  if (record(value)) {
    const fields = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => ({
        key,
        label: readableLabel(key),
        value: toReadableNode(item),
      }));
    return fields.length === 0 ? { kind: 'empty' } : { kind: 'fields', fields };
  }
  return { kind: 'scalar', value: String(value), url: false };
}

export function extractStateDetails(state: {
  kind?: 'resource' | 'action';
  logicalId: string;
  instanceId?: string;
  providerMode?: string;
  removalPolicy?: string;
  providerVersion?: number;
  inputHash?: string;
  props?: unknown;
  attr?: unknown;
  input?: unknown;
  output?: unknown;
}): StateDetails {
  const action = state.kind === 'action';
  const metadata = [
    ['Logical ID', state.logicalId],
    ...(action
      ? [['Input hash', state.inputHash]]
      : [
          ['Instance ID', state.instanceId],
          ['Provider mode', state.providerMode],
          ['Provider version', state.providerVersion],
          ['Removal policy', state.removalPolicy],
        ]),
  ].flatMap(([label, value]) =>
    scalar(value) ? [{ label: String(label), value }] : [],
  );
  return {
    kind: action ? 'action' : 'resource',
    metadata,
    sections: action
      ? [
          { title: 'Input', value: toReadableNode(state.input) },
          { title: 'Output', value: toReadableNode(state.output) },
        ]
      : [
          { title: 'Properties', value: toReadableNode(state.props) },
          { title: 'Attributes', value: toReadableNode(state.attr) },
        ],
  };
}
