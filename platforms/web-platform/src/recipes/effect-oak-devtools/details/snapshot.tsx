import { useState } from 'react';
import type { ReactNode } from 'react';
import { dataOf, pathName } from '../step/index.ts';
import type { Field, Row } from '../step/index.ts';
import { Diff, Value, Was } from './value.tsx';
import { Who } from './who.tsx';

/**
 * The Snapshot read like the map: one block per Instance, indented as deep as
 * it is, with its State and its data as a tree, open all the way. What the
 * Step changed is lit where it sits, its old value struck through beside the
 * new one. Very deep or very long data starts folded, so big apps stay fast.
 */
export const Snapshot = ({ rows }: { readonly rows: ReadonlyArray<Row> }) => {
  const top = Math.min(...rows.map((row) => row.depth));
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <Block key={row.instance.id} row={row} depth={row.depth - top} />
      ))}
    </div>
  );
};

/** Past this deep, or this many entries, a branch starts folded. */
const DEEP = 4;
const LONG = 50;

const Block = ({
  row,
  depth,
}: {
  readonly row: Row;
  readonly depth: number;
}) => {
  const { instance } = row;
  const tag = instance.state._tag;
  const data = dataOf(instance);
  const hasModel = !isEmpty(instance.model);
  const hasState = Object.keys(data).length > 0;
  return (
    <section
      className={`flex flex-col gap-1 ${depth > 0 ? 'border-l pl-3' : ''}`}
      style={{ marginLeft: Math.max(depth - 1, 0) * 12 }}
    >
      <Who row={row}>
        {tag !== 'Single' &&
          (row.transition ? (
            <Was
              before={
                <span>
                  Was <span className="font-mono">{row.transition.from}</span>
                </span>
              }
            >
              <span className="font-mono text-[10px] text-positive">{tag}</span>
            </Was>
          ) : (
            <span className="shrink-0 rounded-full border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
      </Who>
      {!hasModel && !hasState && (
        <p className="text-xs text-muted-foreground/70">No data</p>
      )}
      {hasModel && (
        <Entries where="model" value={instance.model} fields={row.fields} />
      )}
      {hasState && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">
            In <span className="font-mono">{tag}</span>
          </span>
          <Entries where="state" value={data} fields={row.fields} />
        </div>
      )}
    </section>
  );
};

const isContainer = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !(value instanceof Date);

const isEmpty = (value: unknown) =>
  value === undefined ||
  (isContainer(value) && Object.keys(value).length === 0);

const keyOf = (where: Field['in'], path: ReadonlyArray<string | number>) =>
  `${where}:${pathName(path)}`;

/** Every change in one Model or State, by where it is. */
interface At {
  readonly where: Field['in'];
  readonly byPath: ReadonlyMap<string, Field>;
  readonly mine: ReadonlyArray<Field>;
}

/** Whether a field sits strictly inside `path`. */
const within = (field: Field, path: ReadonlyArray<string | number>) =>
  field.path.length > path.length &&
  path.every((part, index) => field.path[index] === part);

/** The data at the top of a Model or State, or a plain value on its own line. */
const Entries = ({
  where,
  value,
  fields,
}: {
  readonly where: Field['in'];
  readonly value: unknown;
  readonly fields: ReadonlyArray<Field>;
}) => {
  const mine = fields.filter((field) => field.in === where);
  const at: At = {
    where,
    byPath: new Map(mine.map((field) => [keyOf(where, field.path), field])),
    mine,
  };
  if (!isContainer(value)) {
    const whole = at.byPath.get(keyOf(where, []));
    return (
      <div className="text-xs">
        {whole ? <Diff field={whole} /> : <Value value={value} />}
      </div>
    );
  }
  return (
    <div className="flex flex-col text-xs">
      <Children value={value} path={[]} at={at} />
    </div>
  );
};

/** A container's entries, then what the Step took out of it. */
const Children = ({
  value,
  path,
  at,
}: {
  readonly value: object;
  readonly path: ReadonlyArray<string | number>;
  readonly at: At;
}) => {
  const [all, setAll] = useState(false);
  const entries: Array<[string | number, unknown]> = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
  const shown = all ? entries : entries.slice(0, LONG);
  const gone = at.mine.filter(
    (field) =>
      field.kind === 'removed' &&
      field.path.length === path.length + 1 &&
      within(field, path),
  );
  return (
    <>
      {shown.map(([name, item]) => (
        <Entry
          key={name}
          name={name}
          value={item}
          path={[...path, name]}
          at={at}
        />
      ))}
      {shown.length < entries.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="self-start py-0.5 pl-3 text-[11px] text-muted-foreground hover:text-foreground"
        >
          +{entries.length - shown.length} more
        </button>
      )}
      {gone.map((field) => (
        <Line
          key={`gone:${pathName(field.path)}`}
          name={field.path.at(-1)!}
          lit
        >
          <Diff field={field} />
        </Line>
      ))}
    </>
  );
};

const Entry = ({
  name,
  value,
  path,
  at,
}: {
  readonly name: string | number;
  readonly value: unknown;
  readonly path: ReadonlyArray<string | number>;
  readonly at: At;
}) => {
  const change = at.byPath.get(keyOf(at.where, path));
  const container = isContainer(value);
  const size = container ? Object.keys(value).length : 0;
  const inside = at.mine.some((field) => within(field, path));
  const [open, setOpen] = useState(
    inside || (path.length < DEEP && size <= LONG),
  );
  if (!container || size === 0)
    return (
      <Line name={name} lit={change !== undefined}>
        {change ? <Diff field={change} /> : <Value value={value} />}
      </Line>
    );
  return (
    <>
      <Line
        name={name}
        lit={change !== undefined}
        open={open}
        onToggle={() => setOpen(!open)}
      >
        <span className="text-muted-foreground">
          {Array.isArray(value) ? `[${size}]` : `{${size}}`}
          {change && (
            <span className="ml-1.5 text-[11px]">
              {change.kind === 'added' ? 'added' : 'replaced'}
            </span>
          )}
          {!open && inside && (
            <span className="ml-1.5 text-[11px] text-foreground">changed</span>
          )}
        </span>
      </Line>
      {open && (
        <div className="ml-[5px] flex flex-col border-l pl-2">
          <Children value={value} path={path} at={at} />
        </div>
      )}
    </>
  );
};

/** One key and its value, lit when the Step changed it. */
const Line = ({
  name,
  lit,
  open,
  onToggle,
  children,
}: {
  readonly name: string | number;
  readonly lit: boolean;
  readonly open?: boolean;
  readonly onToggle?: () => void;
  readonly children: ReactNode;
}) => (
  <div
    className={`-mx-1 flex min-w-0 items-baseline gap-2 rounded-sm px-1 py-px font-mono ${lit ? 'bg-primary/5' : ''}`}
  >
    {onToggle ? (
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex shrink-0 items-baseline gap-1 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className={`inline-block w-2 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        >
          ›
        </span>
        {name}
      </button>
    ) : (
      <span className="shrink-0 pl-3 text-muted-foreground">{name}</span>
    )}
    {children}
  </div>
);
