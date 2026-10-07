import JsonView from '@uiw/react-json-view';

const JSON_FONT_SIZE = 14;
const JSON_FONT_SIZE_ROOMY = 15;

const baseJsonViewStyle = {
  lineHeight: 1.6,
  '--w-rjv-font-family':
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  '--w-rjv-color': 'var(--foreground)',
  '--w-rjv-key-string': 'var(--muted-foreground)',
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-line-color': 'var(--border)',
  '--w-rjv-arrow-color': 'var(--muted-foreground)',
  '--w-rjv-edit-color': 'var(--muted-foreground)',
  '--w-rjv-info-color': 'var(--muted-foreground)',
  '--w-rjv-update-color': 'var(--muted-foreground)',
  '--w-rjv-curlybraces-color': 'var(--muted-foreground)',
  '--w-rjv-brackets-color': 'var(--muted-foreground)',
  '--w-rjv-quotes-color': 'var(--muted-foreground)',
  // Values are content: full foreground in both themes. Only nothing-values
  // are dimmed, and only the broken ones are red.
  '--w-rjv-quotes-string-color': 'var(--foreground)',
  '--w-rjv-type-string-color': 'var(--foreground)',
  '--w-rjv-type-int-color': 'var(--foreground)',
  '--w-rjv-type-float-color': 'var(--foreground)',
  '--w-rjv-type-bigint-color': 'var(--foreground)',
  '--w-rjv-type-boolean-color': 'var(--foreground)',
  '--w-rjv-type-date-color': 'var(--foreground)',
  '--w-rjv-type-url-color': 'var(--foreground)',
  '--w-rjv-type-null-color': 'var(--muted-foreground)',
  '--w-rjv-type-undefined-color': 'var(--muted-foreground)',
  '--w-rjv-type-nan-color': 'var(--destructive)',
} as React.CSSProperties;

function normalizeJsonStrings(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length < 2) return value;
    const first = value[0];
    if (first !== '{' && first !== '[') return value;
    try {
      const parsed = JSON.parse(value);
      if (parsed !== null && typeof parsed === 'object') {
        return normalizeJsonStrings(parsed);
      }
      return value;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(normalizeJsonStrings);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeJsonStrings(v);
    }
    return out;
  }
  return value;
}

interface JsonTreeProps {
  value: object;
  collapsed?: number | boolean;
  size?: 'compact' | 'roomy';
}

export function JsonTree({
  value,
  collapsed = 2,
  size = 'compact',
}: JsonTreeProps) {
  const normalized = normalizeJsonStrings(value) as object;
  const style = {
    ...baseJsonViewStyle,
    fontSize: size === 'roomy' ? JSON_FONT_SIZE_ROOMY : JSON_FONT_SIZE,
  } as React.CSSProperties;
  return (
    <div className="min-w-0 [&_.w-rjv]:!overflow-visible [&_.w-rjv-inner]:!overflow-visible [&_.w-rjv-line]:!whitespace-normal [&_.w-rjv-line]:break-all [&_.w-rjv-value]:!whitespace-pre-wrap [&_.w-rjv-value]:break-all">
      <JsonView
        value={normalized}
        style={style}
        collapsed={collapsed}
        displayDataTypes={false}
        displayObjectSize={false}
        enableClipboard={false}
        indentWidth={size === 'roomy' ? 18 : 14}
        shortenTextAfterLength={0}
      />
    </div>
  );
}
