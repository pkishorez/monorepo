import type { ReactNode } from 'react';

/*
 * A value as a tree to read: each object or array a fold, open down to
 * `open` levels, its keys muted and each kind of value its own colour. A
 * string holding JSON is read as the value it holds.
 */

const COLOUR = {
  string: 'var(--positive)',
  number: 'light-dark(oklch(0.52 0.13 200.723), oklch(0.57 0.13 200.723))',
  boolean: 'light-dark(oklch(0.645 0.2 330.44), oklch(0.695 0.2 330.44))',
  nothing: 'var(--muted-foreground)',
} as const;

const parsed = (value: string): unknown => {
  if (value[0] !== '{' && value[0] !== '[') return value;
  try {
    const read: unknown = JSON.parse(value);
    return read !== null && typeof read === 'object' ? read : value;
  } catch {
    return value;
  }
};

const leaf = (value: unknown): ReactNode => {
  if (value === null || value === undefined)
    return <span style={{ color: COLOUR.nothing }}>{`${value}`}</span>;
  if (typeof value === 'string')
    return (
      <span style={{ color: COLOUR.string }}>{JSON.stringify(value)}</span>
    );
  if (typeof value === 'number' || typeof value === 'bigint')
    return <span style={{ color: COLOUR.number }}>{`${value}`}</span>;
  if (typeof value === 'boolean')
    return <span style={{ color: COLOUR.boolean }}>{`${value}`}</span>;
  return <span>{String(value)}</span>;
};

function Entry({
  name,
  value,
  depth,
  open,
}: {
  readonly name: string | undefined;
  readonly value: unknown;
  readonly depth: number;
  readonly open: number;
}): ReactNode {
  const read = typeof value === 'string' ? parsed(value) : value;
  const label = name !== undefined && (
    <span className="text-muted-foreground">{name}: </span>
  );
  if (read === null || typeof read !== 'object')
    return (
      <div className="break-all whitespace-pre-wrap">
        {label}
        {leaf(read)}
      </div>
    );
  const many = Array.isArray(read);
  const entries = Object.entries(read);
  const [start, end] = many ? ['[', ']'] : ['{', '}'];
  if (entries.length === 0)
    return (
      <div>
        {label}
        <span className="text-muted-foreground">{`${start}${end}`}</span>
      </div>
    );
  return (
    <details open={depth < open} className="group">
      <summary className="cursor-pointer list-none outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground inline-block w-3 transition-transform duration-150 group-open:rotate-90">
          ›
        </span>
        {label}
        <span className="text-muted-foreground">
          {start}
          <span className="group-open:hidden">
            {' '}
            {entries.length} {many ? 'items' : 'keys'} {end}
          </span>
        </span>
      </summary>
      <div className="border-border ml-1.5 border-l pl-3">
        {entries.map(([key, each]) => (
          <Entry
            key={key}
            name={many ? undefined : key}
            value={each}
            depth={depth + 1}
            open={open}
          />
        ))}
      </div>
      <span className="text-muted-foreground pl-3">{end}</span>
    </details>
  );
}

export function JsonTree({
  value,
  open = 2,
}: {
  readonly value: object;
  /** How many levels start open. */
  readonly open?: number;
}) {
  return (
    <div className="min-w-0 font-mono text-[12.5px] leading-relaxed">
      <Entry name={undefined} value={value} depth={0} open={open} />
    </div>
  );
}
