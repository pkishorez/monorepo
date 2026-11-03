import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';

/*
 * A value as a browser's console shows one: a string, number or boolean in
 * its colour; an object or array folded to one line that previews what is
 * in it, with a caret that opens it into one line per field, each field
 * folding the same way. A tagged value leads with its tag. Opening and
 * folding is per value, by click or by keyboard, so a reader can walk
 * into exactly the part they want.
 */

const string = 'text-[#0a3069] dark:text-[#a5d6ff]';
const literal = 'text-[#0550ae] dark:text-[#79c0ff]';
const muted = 'text-muted-foreground';

/** How many fields a folded value previews before it says there are more. */
const PREVIEW = 4;

type Entries = ReadonlyArray<readonly [string, unknown]>;

/** An object or array, as its tag, its brackets and its entries; or null for a leaf. */
const branch = (
  value: unknown,
): {
  readonly tag?: string;
  readonly open: string;
  readonly close: string;
  readonly entries: Entries;
} | null => {
  if (value === null || typeof value !== 'object') return null;
  if (value instanceof Date) return null;
  // An error with fields of its own, as a tagged error has: its tag, its
  // message if it has one, and its fields, all to open.
  if (value instanceof Error) {
    const own = Object.entries(value).filter(
      ([key]) => key !== '_tag' && key !== 'stack',
    );
    if (own.length === 0) return null;
    const tag = (value as { readonly _tag?: unknown })._tag;
    return {
      tag: typeof tag === 'string' ? tag : value.name,
      open: '{',
      close: '}',
      entries: [
        ...(value.message ? [['message', value.message] as const] : []),
        ...own,
      ],
    };
  }
  if (Array.isArray(value))
    return {
      open: '[',
      close: ']',
      entries: value.map((item, index) => [String(index), item] as const),
    };
  if (value instanceof Map)
    return {
      tag: 'Map',
      open: '{',
      close: '}',
      entries: [...value.entries()].map(
        ([key, item]) => [String(key), item] as const,
      ),
    };
  if (value instanceof Set)
    return {
      tag: 'Set',
      open: '[',
      close: ']',
      entries: [...value].map((item, index) => [String(index), item] as const),
    };
  const { _tag, ...fields } = value as Record<string, unknown>;
  const tagged = typeof _tag === 'string';
  return {
    ...(tagged ? { tag: _tag } : {}),
    open: '{',
    close: '}',
    // The toolkit's own fields, `_v` first among them, lead: they are what
    // a reader looks for, and a folded preview must not cut them off.
    entries: Object.entries(tagged ? fields : value).sort(
      ([a], [b]) => Number(b.startsWith('_')) - Number(a.startsWith('_')),
    ),
  };
};

function Leaf({ value }: { readonly value: unknown }): ReactNode {
  if (typeof value === 'string')
    return <span className={string}>'{value}'</span>;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return <span className={literal}>{String(value)}</span>;
  if (value === null || value === undefined)
    return <span className={muted}>{String(value)}</span>;
  if (typeof value === 'function')
    return <span className={muted}>ƒ {value.name || 'anonymous'}</span>;
  if (value instanceof Date)
    return (
      <span>
        <span className={muted}>Date </span>
        <span className={string}>{value.toISOString()}</span>
      </span>
    );
  if (value instanceof Error)
    return (
      <span className="text-red-700 dark:text-red-300">
        {value.name}
        {value.message ? `: ${value.message}` : ''}
      </span>
    );
  return <span>{String(value)}</span>;
}

/** A folded value's one line: a few of its entries, one level deep. */
function Preview({
  value,
  depth = 0,
}: {
  readonly value: unknown;
  readonly depth?: number;
}) {
  const node = branch(value);
  if (!node) return <Leaf value={value} />;
  const array = node.open === '[';
  const shown = node.entries.slice(0, depth === 0 ? PREVIEW : PREVIEW - 1);
  return (
    <span>
      {node.tag && (
        <span className="font-semibold text-foreground">{node.tag} </span>
      )}
      {node.entries.length === 0 && node.tag ? null : array ? '[' : '{ '}
      {shown.map(([key, item], index) => (
        <span key={key}>
          {index > 0 && ', '}
          {!array && <span className={muted}>{key}: </span>}
          {branch(item) && depth > 0 ? (
            <span className={muted}>
              {Array.isArray(item) ? `Array(${item.length})` : '{…}'}
            </span>
          ) : branch(item) ? (
            <Preview value={item} depth={depth + 1} />
          ) : (
            <Leaf value={item} />
          )}
        </span>
      ))}
      {node.entries.length > shown.length && <span className={muted}>, …</span>}
      {node.entries.length === 0 && node.tag ? null : array ? ']' : ' }'}
    </span>
  );
}

/** One value, folded or open; a leaf as itself. */
export function Inspect({
  value,
  open: startsOpen = false,
}: {
  readonly value: unknown;
  /** Whether it starts open. */
  readonly open?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(startsOpen);
  const node = branch(value);
  if (!node) return <Leaf value={value} />;
  if (node.entries.length === 0) return <Preview value={value} />;
  const array = node.open === '[';
  return (
    <span>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="-ml-0.5 inline rounded px-0.5 text-left hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRightIcon
          aria-hidden
          className={`mr-0.5 inline size-3 align-[-0.1em] text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        {open ? (
          <span>
            {node.tag && (
              <span className="font-semibold text-foreground">{node.tag} </span>
            )}
            <span className={muted}>
              {array ? `Array(${node.entries.length})` : node.open}
            </span>
          </span>
        ) : (
          <Preview value={value} />
        )}
      </button>
      {open && (
        <>
          <span className="ml-1.5 block border-l border-border/70 pl-3">
            {node.entries.map(([key, item]) => (
              <span key={key} className="block">
                <span className={muted}>{key}: </span>
                <Inspect value={item} />
              </span>
            ))}
          </span>
          <span className={`block pl-1 ${muted}`}>{node.close}</span>
        </>
      )}
    </span>
  );
}
