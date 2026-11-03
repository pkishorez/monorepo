// Reads the table in memory once it is made: a Promise outside React,
// dropped on unmount.
// eslint-disable-next-line no-restricted-imports
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Cause, Effect, Exit, Stream } from 'effect';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { RotateCcwIcon } from 'lucide-react';
import { Memory } from '@kestack/std-toolkit/db/memory';
import type { MemoryTable } from '@kestack/std-toolkit/db/memory';
import { Inspect } from '../../../components/index.ts';
import type { Lab } from './lab.ts';

/*
 * A Live Table: a real std-toolkit table on the Memory adapter, driven by
 * the buttons its page gives it. On the left, every row as the table
 * stores it, its version stamp first; on the right, the same rows as the
 * app reads them. Nothing is kept: the table starts empty on every visit,
 * and Reset empties it again. What the last press did, or why it failed,
 * is said under the buttons.
 */

type Row = {
  readonly key: string;
  /** Its primary key, then each index key it has, by attribute. */
  readonly keys: ReadonlyArray<readonly [string, string]>;
  readonly entity: string;
  readonly version: string | undefined;
  readonly deleted: boolean;
  readonly fields: ReadonlyArray<readonly [string, unknown]>;
};

type Said = { readonly ok: boolean; readonly text: string } | null;

type Seen = {
  readonly stored: ReadonlyArray<Row>;
  readonly read: ReadonlyArray<unknown> | { readonly failed: string };
};

const EMPTY: Seen = { stored: [], read: [] };

const fieldsOf = (value: unknown): ReadonlyArray<readonly [string, unknown]> =>
  value !== null && typeof value === 'object'
    ? Object.entries(value)
    : [['', value]];

/**
 * What a reader needs to know about a failure, not its trace: the error's
 * own message, or what a DatabaseError says went wrong, or else the first
 * line of the cause that says anything.
 */
const reason = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause) as {
    readonly message?: unknown;
    readonly reason?: {
      readonly _tag?: unknown;
      readonly message?: unknown;
      readonly cause?: { readonly message?: unknown };
    };
  } | null;
  const said = [
    error?.reason?.message,
    error?.reason?.cause?.message,
    error?.message,
  ].find(
    (text): text is string => typeof text === 'string' && text.trim() !== '',
  );
  if (said) return said;
  if (typeof error?.reason?._tag === 'string') return error.reason._tag;
  return (
    Cause.pretty(cause)
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '' && !/^\w+:$/.test(line)) ?? 'It failed.'
  );
};

/** What the table holds now, and what the app reads from it. */
const look = <Name extends string>(lab: Lab<Name>, table: MemoryTable<Name>) =>
  Effect.gen(function* () {
    const items = yield* Stream.runCollect(lab.table.scan());
    const stored = [...items].map((item): Row => ({
      key: `${item.pk}·${item.sk}·${item.meta._u}`,
      keys: [['pk', item.pk], ['sk', item.sk], ...Object.entries(item.keys)],
      entity: item.meta._e,
      version: typeof item.data._v === 'string' ? item.data._v : undefined,
      deleted: item.meta._d,
      fields: Object.entries(item.data).filter(([name]) => name !== '_v'),
    }));
    const read = lab.read
      ? yield* Effect.exit(lab.read.effect).pipe(
          Effect.map((exit) =>
            Exit.isSuccess(exit) ? exit.value : { failed: reason(exit.cause) },
          ),
        )
      : [];
    return { stored, read };
  }).pipe(Effect.provide(table.layer));

export function LiveTable<Name extends string>({
  lab,
  caption,
}: {
  readonly lab: Lab<Name>;
  /** A line under it on what to try and what to notice. */
  readonly caption?: string;
}) {
  const [memory, setMemory] = useState(() => Memory.make(lab.table));
  const [seen, setSeen] = useState<Seen>(EMPTY);
  const [said, setSaid] = useState<Said>(null);
  const [pressed, setPressed] = useState<Readonly<Record<string, number>>>({});
  const [busy, setBusy] = useState(false);

  // The table is empty at first; a page whose lab reads still says so.
  useEffect(() => {
    let live = true;
    Effect.runPromise(look(lab, memory)).then(
      (next) => live && setSeen(next),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [lab, memory]);

  const press = async (index: number) => {
    const action = lab.actions[index]!;
    const times = pressed[action.label] ?? 0;
    setBusy(true);
    const exit = await Effect.runPromiseExit(
      action.run(times).pipe(Effect.provide(memory.layer)),
    );
    setPressed((now) => ({ ...now, [action.label]: times + 1 }));
    setSaid(
      Exit.isSuccess(exit)
        ? { ok: true, text: `${action.label}: done.` }
        : { ok: false, text: `${action.label}: ${reason(exit.cause)}` },
    );
    setSeen(await Effect.runPromise(look(lab, memory)));
    setBusy(false);
  };

  const reset = () => {
    setMemory(Memory.make(lab.table));
    setPressed({});
    setSaid(null);
  };

  return (
    <MotionConfig reducedMotion="user">
      <figure className="my-8">
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-[13px] font-medium">Live Table</span>
            <code className="font-mono text-[11px] text-muted-foreground">
              {lab.table.logicalName}
            </code>
            <span className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
              in memory
            </span>
            <button
              type="button"
              onClick={reset}
              className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <RotateCcwIcon className="size-3" />
              Reset
            </button>
          </div>
          <div className="space-y-2 border-b border-border px-3 py-3">
            <div className="flex flex-wrap gap-2">
              {lab.actions.map((action, index) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={busy}
                  onClick={() => void press(index)}
                  className="inline-flex min-h-8 items-center rounded-md border border-border bg-background px-3 text-[13px] font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.97] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10"
                >
                  {action.label}
                </button>
              ))}
            </div>
            <p
              aria-live="polite"
              className={`min-h-5 text-[12.5px] ${said && !said.ok ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {said?.text ??
                'Press a button: every one runs against a real table.'}
            </p>
          </div>
          <div className="grid divide-border sm:grid-cols-2 sm:divide-x max-sm:divide-y">
            <Column title="Stored" note="as the table keeps it">
              <Rows
                empty="No rows yet."
                items={seen.stored.map((row) => ({
                  key: row.key,
                  node: <StoredRow row={row} />,
                }))}
              />
            </Column>
            {lab.read && (
              <Column title="Read" note={lab.read.label}>
                {'failed' in seen.read ? (
                  <p className="px-3 py-3 font-mono text-[12px] text-destructive">
                    {seen.read.failed}
                  </p>
                ) : (
                  <Rows
                    empty="Nothing to read."
                    items={seen.read.map((value, index) => ({
                      key: `${index}:${JSON.stringify(value)}`,
                      node: <Fields fields={fieldsOf(value)} />,
                    }))}
                  />
                )}
              </Column>
            )}
          </div>
        </div>
        {caption && (
          <figcaption className="mt-2 text-[13px] text-pretty text-muted-foreground">
            {caption}
          </figcaption>
        )}
      </figure>
    </MotionConfig>
  );
}

function Column({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-2 px-3 pt-3 text-[12px]">
        <span className="font-medium">{title}</span>
        <span className="truncate text-muted-foreground">{note}</span>
      </p>
      {children}
    </div>
  );
}

function Rows({
  items,
  empty,
}: {
  readonly items: ReadonlyArray<{
    readonly key: string;
    readonly node: ReactNode;
  }>;
  readonly empty: string;
}) {
  if (items.length === 0)
    return (
      <p className="px-3 py-3 text-[12.5px] text-muted-foreground">{empty}</p>
    );
  return (
    <ul className="space-y-2 p-3">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li
            key={item.key}
            layout="position"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-lg border border-border bg-background px-2.5 py-2"
          >
            {item.node}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function StoredRow({ row }: { readonly row: Row }) {
  return (
    <>
      <p className="mb-1 flex items-center gap-1.5 text-[11px]">
        <span className="font-medium">{row.entity}</span>
        {row.version && (
          <span className="rounded bg-foreground px-1 font-mono text-[10px] text-background">
            {row.version}
          </span>
        )}
        {row.deleted && (
          <span className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
            deleted
          </span>
        )}
      </p>
      <dl className="mb-1.5 flex flex-wrap gap-x-2.5 font-mono text-[10.5px] leading-4 text-muted-foreground">
        {row.keys.map(([name, value]) => (
          <div key={name} className="flex min-w-0 gap-1">
            <dt>{name}</dt>
            <dd className="truncate text-foreground/70">{value}</dd>
          </div>
        ))}
      </dl>
      <Fields fields={row.fields} />
    </>
  );
}

function Fields({
  fields,
}: {
  readonly fields: ReadonlyArray<readonly [string, unknown]>;
}) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 font-mono text-[11.5px] leading-5">
      {fields.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-muted-foreground">{name}</dt>
          <dd className="min-w-0">
            <Inspect value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
