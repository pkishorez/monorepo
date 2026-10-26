// oxlint-disable-next-line no-restricted-imports -- a prototype: an open card is measured before it is painted, so the layout moves once.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowRightIcon,
  ChevronRightIcon,
  XIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { motion } from '@kestack/web-platform/ui/components/motion';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { JsonTree } from '@kestack/web-platform/ui/viewers/json';
import type { Condition, SlotPrint } from '../read/blueprint.ts';
import type { GraphNode, Placed } from '../read/graph.ts';
import {
  casesOf,
  depthFor,
  fieldsOf,
  schemaJson,
  schemaShape,
  textOf,
  type Field,
} from '../read/schema.ts';
import { unified } from '../read/diff.ts';
import type { Part } from '../story/scenes.ts';
import { CARD_SPRING } from './space.ts';

/*
 * One Actor on the canvas, in two greys, the card and its header band,
 * and few colours, each saying one thing:
 *
 *   teal   running: a Worker that runs, a Child that is there, the section
 *          they are in, and the card of an Actor whose own Workers run. It
 *          is the base: a change's colour wins over it.
 *   green  the Step added it: a Worker started, a Child invoked.
 *   amber  the Step changed it: its State, its Model, a Message it took,
 *          and the card of any Actor the Step touched at all.
 *   red    the Step took it away: a Worker stopped, a Child stopped.
 *
 * A change shows where it is and on everything that holds it: the row,
 * the section it is in, the count that stands for it while folded. The
 * card whose Message it was is called out from above, the Message named:
 * amber when it changed the card, grey when it changed nothing or no rule
 * took it.
 *
 * Small, a card says its slot, its State and how many Workers run. Open,
 * it is laid out at its own size, so its Children move aside; its header
 * closes it again. It shows one of three modes:
 *
 * 1. Blueprint  everything it can be: Always, what holds whatever the
 *               State, then its States, nested under it; its Model and
 *               Props as Schemas; its Capabilities.
 * 2. Active     what it is now: Always and the one State it is in, the
 *               rest gone; its Model and Props as values.
 * 3. Focus      the Blueprint with all but what holds now dimmed, and the
 *               dimmed States shut.
 */

export type Size = 'small' | 'open';

export const SMALL = { width: 220, height: 58 } as const;
export const OPEN_WIDTH = 408;
/** The room a callout over a card takes: its label and its arrow. */
export const CALLOUT = 46;

/** What came of the Message a card took: it changed the card, or it did not. */
const tookChanged = (node: GraphNode) =>
  node.took?.outcome === 'handled' && node.change !== undefined;

/** A line's style, by when the Child exists: solid, dashed, dotted. */
export const DASH: Record<Condition, string | undefined> = {
  always: undefined,
  while: '6 5',
  each: '1.5 4',
};

type Mode = 'blueprint' | 'active' | 'focus';

// Colours ----------------------------------------------------------------------

type Kind = 'added' | 'changed' | 'removed';

const TINT: Record<Kind, string> = {
  added: 'bg-positive/10 ring-1 ring-positive/40',
  changed: 'bg-warning/10 ring-1 ring-warning/40',
  removed: 'bg-destructive/10 ring-1 ring-destructive/40',
};

const INK: Record<Kind, string> = {
  added: 'text-positive',
  changed: 'text-warning',
  removed: 'text-destructive',
};

/** Running, softly: what is active now, under any change. */
const RUNNING = 'bg-chart-8/10 ring-1 ring-chart-8/30';
/** A section with something active in it: fainter still, so what runs in it stands out. */
const ACTIVE = 'bg-chart-8/[0.06] ring-1 ring-chart-8/25';
const ACTIVE_INK = 'font-medium text-chart-8';

/**
 * The one colour for a group, from each of its items, `undefined` for one
 * the Step left alone, as a diff would: red only when every item went,
 * green when all it did was add, amber for anything else.
 */
const rollup = (kinds: ReadonlyArray<Kind | undefined>): Kind | undefined => {
  const touched = kinds.filter((kind) => kind !== undefined);
  if (touched.length === 0) return undefined;
  if (kinds.every((kind) => kind === 'removed')) return 'removed';
  if (touched.every((kind) => kind === 'added')) return 'added';
  return 'changed';
};

// Marks --------------------------------------------------------------------------

function Tag({
  children,
  kind,
}: {
  readonly children: ReactNode;
  readonly kind?: Kind;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[11px]',
        kind ? TINT[kind] : 'border border-border bg-background/60',
      )}
    >
      {children}
    </span>
  );
}

function Label({
  children,
  kind,
}: {
  readonly children: ReactNode;
  readonly kind?: Kind;
}) {
  return (
    <h4
      className={cn(
        'text-[10px] font-medium tracking-wider uppercase',
        kind ? INK[kind] : 'text-muted-foreground',
      )}
    >
      {children}
    </h4>
  );
}

/** A part a Scene points at, ringed while it does. */
function Spot({
  on,
  className,
  children,
}: {
  readonly on: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <span
      data-focus={on || undefined}
      className={cn(
        'rounded-md',
        on && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-card',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A value, short enough for a line. */
const brief = (value: unknown): string => {
  if (typeof value === 'string')
    return JSON.stringify(value.length > 28 ? `${value.slice(0, 28)}…` : value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value).length}}`;
  return String(value);
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** `Name(a, b)`: a tag and the fields it carries. */
function Carries({
  name,
  fields,
}: {
  readonly name: string;
  readonly fields: ReadonlyArray<Field> | undefined;
}) {
  return (
    <span className="font-mono text-xs">
      {name}
      {fields && fields.length > 0 && (
        <span className="text-muted-foreground">
          ({fields.map((field) => field.name).join(', ')})
        </span>
      )}
    </span>
  );
}

// Levels ---------------------------------------------------------------------

interface WorkerRow {
  readonly name: string;
  readonly condition: Condition;
  /** Written at the top, and seen to run only in this State. */
  readonly seen: boolean;
}

interface Level {
  /** `*` for Always, else the State's tag. */
  readonly key: string;
  readonly workers: ReadonlyArray<WorkerRow>;
  readonly on: ReadonlyArray<{
    readonly name: string;
    readonly to: ReadonlyArray<string>;
  }>;
  readonly children: ReadonlyArray<SlotPrint>;
  readonly gives: ReadonlyArray<string>;
}

/** Always, then each State, with what was seen of it filed where it ran. */
const levelsOf = (
  node: GraphNode,
): { readonly always: Level; readonly states: ReadonlyArray<Level> } => {
  const { print, known } = node;
  const onlyIn = (worker: {
    readonly name: string;
    readonly condition: Condition;
  }) => {
    if (worker.condition === 'always') return null;
    const states = known?.ran.get(worker.name);
    return states && states.size === 1 ? [...states][0]! : null;
  };
  const targets = (message: string, from: string | null) => [
    ...new Set(
      (known?.moves ?? [])
        .filter(
          (move) =>
            move.message === message && (from === null || move.from === from),
        )
        .map((move) => move.to),
    ),
  ];
  const single = print.single ? print.state['Single'] : undefined;
  const always: Level = {
    key: '*',
    workers: [
      ...print.top.workers.filter(
        (worker) => single || onlyIn(worker) === null,
      ),
      ...(single?.workers ?? []),
    ].map((worker) => ({ ...worker, seen: false })),
    on: [...print.top.on, ...(single?.on ?? [])].map((name) => ({
      name,
      to: targets(name, null),
    })),
    children: [...print.top.children, ...(single?.children ?? [])],
    gives: known?.gives.top ?? [],
  };
  if (single) return { always, states: [] };
  return {
    always,
    states: print.states.map((tag): Level => {
      const level = print.state[tag]!;
      return {
        key: tag,
        workers: [
          ...level.workers.map((worker) => ({ ...worker, seen: false })),
          ...print.top.workers
            .filter((worker) => onlyIn(worker) === tag)
            .map((worker) => ({ ...worker, seen: true })),
        ],
        on: level.on.map((name) => ({ name, to: targets(name, tag) })),
        children: level.children,
        gives: known?.gives.state[tag] ?? [],
      };
    }),
  };
};

const keysOf = (node: GraphNode, worker: string) =>
  node.workers?.find((one) => one.name === worker)?.keys ?? [];

const isRunning = (node: GraphNode, worker: string) =>
  keysOf(node, worker).length > 0;

const childOf = (node: GraphNode, slot: string) =>
  node.children.find((child) => child.title.split(' #')[0] === slot);

/** What the Step did to one of its Workers, by name, whatever its key. */
const workerKind = (node: GraphNode, worker: string): Kind | undefined =>
  (node.change?.started ?? []).some((label) => label.split('#')[0] === worker)
    ? 'added'
    : (node.change?.stopped ?? []).some(
          (label) => label.split('#')[0] === worker,
        )
      ? 'removed'
      : undefined;

/** What the Step did to one of its Children, by slot. */
const childKind = (node: GraphNode, slot: string): Kind | undefined => {
  if ((node.gone ?? []).some((one) => one.slot === slot)) return 'removed';
  const change = childOf(node, slot)?.change;
  return change?.kind === 'added' ? 'added' : change ? 'changed' : undefined;
};

/** What the Step did inside a level, by part, and to the level as a whole. */
const kindsOf = (level: Level, node: GraphNode, live: boolean) => {
  if (!live)
    return {
      workers: undefined,
      handles: undefined,
      children: undefined,
      all: undefined,
    };
  const workers = rollup(
    level.workers.map((worker) => workerKind(node, worker.name)),
  );
  // A Message taken counts as a change only when it changed something.
  const handles =
    tookChanged(node) &&
    level.on.some((message) => node.took?.message === message.name)
      ? ('changed' as const)
      : undefined;
  const children = rollup(
    level.children.map((child) => childKind(node, child.name)),
  );
  const entered =
    node.change?.state?.[1] === level.key ? ('changed' as const) : undefined;
  // Each part it has counts, left alone or not: one part gone is not the level gone.
  const all = rollup([
    ...(level.workers.length > 0 ? [workers] : []),
    ...(level.on.length > 0 ? [handles] : []),
    ...(level.children.length > 0 ? [children] : []),
    ...(entered ? [entered] : []),
  ]);
  return { workers, handles, children, all };
};

/** What is active in a level now: Workers running, Children there. */
const activeIn = (level: Level, node: GraphNode, live: boolean) => {
  const workers = live
    ? level.workers.filter((worker) => isRunning(node, worker.name)).length
    : 0;
  const children = live
    ? level.children.filter((child) => childOf(node, child.name) !== undefined)
        .length
    : 0;
  return { workers, children, any: workers + children > 0 };
};

/** The section a Scene's part is in. */
const sectionOfPart = (
  levels: ReturnType<typeof levelsOf>,
  part: Part | undefined,
) => {
  if (!part) return undefined;
  const all = [levels.always, ...levels.states];
  switch (part.kind) {
    case 'state':
      return part.name;
    case 'message':
      return part.state ?? '*';
    case 'worker':
      return all.find((level) =>
        level.workers.some(({ name }) => name === part.name),
      )?.key;
    case 'child':
      return all.find((level) =>
        level.children.some(({ name }) => name === part.name),
      )?.key;
    case 'requires':
    case 'provides':
      return 'capabilities';
  }
};

/** A level folded: how many Workers, Messages and Children it holds, each in the colour of its change. */
function Counts({
  level,
  node,
  live,
}: {
  readonly level: Level;
  readonly node: GraphNode;
  readonly live: boolean;
}) {
  const kinds = kindsOf(level, node, live);
  const active = activeIn(level, node, live);
  const running = active.workers;
  const parts = [
    level.workers.length > 0 && {
      key: 'w',
      text:
        running > 0
          ? `${running}/${plural(level.workers.length, 'worker')}`
          : plural(level.workers.length, 'worker'),
      kind: kinds.workers,
      active: running > 0,
    },
    level.on.length > 0 && {
      key: 'm',
      text: plural(level.on.length, 'handle'),
      kind: kinds.handles,
      active: false,
    },
    level.children.length > 0 && {
      key: 'c',
      text: plural(level.children.length, 'child', 'children'),
      kind: kinds.children,
      active: active.children > 0,
    },
  ].filter((one) => one !== false);
  if (parts.length === 0) return <>—</>;
  return (
    <>
      {parts.map((part, i) => (
        <span key={part.key}>
          {i > 0 && ' · '}
          {/* A change wins its colour; else what is active is in teal. */}
          <span
            className={cn(
              part.kind
                ? cn('font-medium', INK[part.kind])
                : part.active && ACTIVE_INK,
            )}
          >
            {part.text}
          </span>
        </span>
      ))}
    </>
  );
}

/** What a State carries, from its Schema; its values while the Instance is in it. */
function StateFields({
  node,
  tag,
}: {
  readonly node: GraphNode;
  readonly tag: string;
}) {
  const fields = casesOf(node.definition.schemas.state).get(tag) ?? [];
  if (fields.length === 0) return null;
  const now =
    node.instance?.state._tag === tag
      ? (node.instance.state as unknown as Record<string, unknown>)
      : undefined;
  return (
    <section className="flex flex-col gap-1">
      <Label>Holds</Label>
      <ul className="flex flex-col font-mono text-[11px]">
        {fields.map(({ name, shape }) => (
          <li key={name} className="flex min-w-0 gap-2 px-1 py-0.5">
            <span className="shrink-0">{name}</span>
            <span className="truncate text-muted-foreground">
              {now ? brief(now[name]) : textOf(shape)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Names({ names }: { readonly names: ReadonlyArray<string> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span
          key={name}
          className="inline-flex h-6 items-center rounded-md border border-border bg-muted/40 px-2 text-[11px]"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

/** A level open: everything written in it. */
function Opened({
  level,
  node,
  mode,
  current,
  focus,
  onChild,
}: {
  readonly level: Level;
  readonly node: GraphNode;
  readonly mode: Mode;
  /** Whether it holds now: in Focus, what does not run is dimmed. */
  readonly current: boolean;
  readonly focus?: Part;
  readonly onChild: (title: string) => void;
}) {
  const live = mode !== 'blueprint' && node.instance !== undefined;
  const messages = casesOf(node.definition.schemas.message);
  const kinds = kindsOf(level, node, live);
  const gone = live
    ? (node.gone ?? []).filter((one) =>
        level.children.some((child) => child.name === one.slot),
      )
    : [];
  return (
    <div className="flex flex-col gap-3 pt-1 pb-3 pl-5">
      {level.key !== '*' && <StateFields node={node} tag={level.key} />}
      {level.workers.length > 0 && (
        <section className="flex flex-col gap-1">
          <Label kind={kinds.workers}>Workers</Label>
          <ul className="flex flex-col gap-0.5">
            {level.workers.map((worker) => {
              const keys = keysOf(node, worker.name);
              const on = live && keys.length > 0;
              const kind = live ? workerKind(node, worker.name) : undefined;
              return (
                <li
                  key={worker.name}
                  className={cn(
                    mode === 'focus' && current && !on && !kind && 'opacity-40',
                  )}
                >
                  <Spot
                    on={focus?.kind === 'worker' && focus.name === worker.name}
                    className={cn(
                      'flex h-7 items-center gap-2 px-2',
                      kind ? TINT[kind] : on && RUNNING,
                    )}
                  >
                    <span
                      className={cn(
                        'font-mono text-xs',
                        !on && live && 'text-muted-foreground',
                        kind === 'removed' && 'line-through',
                      )}
                    >
                      {worker.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {worker.condition}
                    </span>
                    <span
                      className={cn(
                        'ml-auto truncate font-mono text-[11px] tabular-nums',
                        kind ? INK[kind] : 'text-muted-foreground',
                      )}
                    >
                      {kind === 'added'
                        ? 'started'
                        : kind === 'removed'
                          ? 'stopped'
                          : on
                            ? keys.some((key) => key !== '')
                              ? keys.map((key) => `#${key}`).join(' ')
                              : ''
                            : ''}
                    </span>
                  </Spot>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {level.on.length > 0 && (
        <section className="flex flex-col gap-1">
          <Label kind={kinds.handles}>Handles</Label>
          <ul className="flex flex-col gap-0.5">
            {level.on.map((message) => {
              const took = live && node.took?.message === message.name;
              return (
                <li key={message.name}>
                  <Spot
                    on={
                      focus?.kind === 'message' &&
                      focus.name === message.name &&
                      (focus.state ?? '*') === level.key
                    }
                    className={cn(
                      'flex min-h-7 flex-wrap items-center gap-1.5 px-2',
                      took &&
                        (tookChanged(node)
                          ? TINT.changed
                          : 'bg-muted/50 ring-1 ring-border'),
                    )}
                  >
                    <Carries
                      name={message.name}
                      fields={messages.get(message.name)}
                    />
                    {message.to.map((to) => (
                      <span
                        key={to}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground"
                      >
                        <ArrowRightIcon aria-hidden className="size-3" />
                        <span className="font-mono text-foreground">{to}</span>
                      </span>
                    ))}
                    {took && (
                      <span
                        className={cn(
                          'ml-auto text-[11px]',
                          tookChanged(node)
                            ? 'font-medium text-warning'
                            : 'text-muted-foreground',
                        )}
                      >
                        {node.took?.outcome !== 'handled'
                          ? 'ignored'
                          : tookChanged(node)
                            ? 'handled'
                            : 'no change'}
                      </span>
                    )}
                  </Spot>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {(level.children.length > 0 || gone.length > 0) && (
        <section className="flex flex-col gap-1">
          <Label kind={kinds.children}>Children</Label>
          <div className="flex flex-wrap gap-1">
            {level.children.map((child) => {
              const there = childOf(node, child.name);
              // Running, a Child its Condition does not hold for now is not there.
              const absent = node.instance !== undefined && there === undefined;
              const kind = live ? childKind(node, child.name) : undefined;
              if (absent && kind === 'removed') return null;
              return (
                <Spot
                  key={child.name}
                  on={focus?.kind === 'child' && focus.name === child.name}
                >
                  <button
                    type="button"
                    disabled={absent}
                    title={
                      absent ? `Not there now: ${child.condition}` : undefined
                    }
                    onClick={() => onChild(child.name)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                      absent
                        ? 'cursor-default border border-dashed border-border text-muted-foreground'
                        : kind
                          ? TINT[kind]
                          : live
                            ? cn(RUNNING, 'hover:bg-chart-8/20')
                            : 'border border-border bg-muted/40 hover:bg-muted',
                    )}
                  >
                    {child.name}
                    {child.condition !== 'always' && (
                      <span className="text-muted-foreground">
                        {child.condition}
                      </span>
                    )}
                  </button>
                </Spot>
              );
            })}
            {gone.map((one) => (
              <span
                key={one.id}
                title="Stopped at this Step"
                className={cn(
                  'inline-flex h-7 items-center rounded-md px-2 text-[11px] line-through',
                  TINT.removed,
                )}
              >
                {one.slot}
              </span>
            ))}
          </div>
        </section>
      )}
      {level.gives.length > 0 && (
        <section className="flex flex-col gap-1">
          <Label>Gives</Label>
          <Names names={level.gives} />
        </section>
      )}
    </div>
  );
}

// Data: JSON --------------------------------------------------------------------

/** A value as JSON, coloured by kind, opened only as deep as about ten lines, held to a height. */
function Json({ value }: { readonly value: unknown }) {
  if (typeof value !== 'object' || value === null)
    return <span className="font-mono text-xs">{brief(value)}</span>;
  return (
    <div
      data-space-scroll
      className="max-h-72 overflow-auto pr-1 [&_.w-rjv]:!text-[12px] [&_.w-rjv]:!leading-[1.55]"
    >
      <JsonTree value={value} collapsed={depthFor(value)} tone="syntax" />
    </div>
  );
}

/**
 * What the Step changed in a value, as a unified diff of its JSON: lines
 * removed in red, added in green, two lines kept around each change and
 * the rest folded to a count.
 */
function Diff({
  before,
  after,
}: {
  readonly before: unknown;
  readonly after: unknown;
}) {
  const rows = useMemo(() => unified(before, after), [before, after]);
  const added = rows.filter((row) => row.kind === 'added').length;
  const removed = rows.filter((row) => row.kind === 'removed').length;
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        <span className="ml-auto font-mono tracking-normal text-positive normal-case">
          +{added}
        </span>
        <span className="font-mono tracking-normal text-destructive normal-case">
          −{removed}
        </span>
      </div>
      <div data-space-scroll className="max-h-64 overflow-auto">
        <div className="w-max min-w-full py-1 font-mono text-[11px] leading-[1.6]">
          {rows.map((row, index) =>
            row.kind === 'skip' ? (
              <div
                key={index}
                className="bg-muted/30 px-2 text-muted-foreground select-none"
              >
                ⋯ {row.count}
              </div>
            ) : (
              <div
                key={index}
                className={cn(
                  'flex pr-3 whitespace-pre',
                  row.kind === 'removed' && 'bg-destructive/10',
                  row.kind === 'added' && 'bg-positive/10',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'w-5 shrink-0 text-center select-none',
                    row.kind === 'removed'
                      ? 'text-destructive'
                      : row.kind === 'added'
                        ? 'text-positive'
                        : 'text-muted-foreground/50',
                  )}
                >
                  {row.kind === 'removed'
                    ? '−'
                    : row.kind === 'added'
                      ? '+'
                      : ' '}
                </span>
                <span
                  className={cn(row.kind === 'same' && 'text-muted-foreground')}
                >
                  {row.text}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** A value as its Schema encodes it, so the JSON reads as it would be saved. */
const encoded = (encode: (value: unknown) => unknown, value: unknown) => {
  try {
    return encode(value);
  } catch {
    return value;
  }
};

// The sections ----------------------------------------------------------------

function Sections({
  node,
  mode,
  focus,
  onChild,
}: {
  readonly node: GraphNode;
  readonly mode: Mode;
  readonly focus?: Part;
  readonly onChild: (title: string) => void;
}) {
  const levels = levelsOf(node);
  const current = node.instance?.state._tag ?? node.state ?? null;
  const [open, setOpen] = useState<string | null>(
    sectionOfPart(levels, focus) ??
      (mode === 'blueprint' ? null : (current ?? '*')),
  );
  const { schemas, encoding } = node.definition;
  const model = schemaShape(schemas.model);
  const props = schemaShape(schemas.props);
  const { instance, change } = node;
  const gives = [
    ...new Set([
      ...(node.known?.gives.top ?? []),
      ...Object.values(node.known?.gives.state ?? {}).flat(),
    ]),
  ];
  const provides =
    node.print.top.provides ||
    Object.values(node.print.state).some((level) => level.provides);
  // Active shows only the State it is in.
  const states =
    mode === 'active'
      ? levels.states.filter((level) => level.key === current)
      : levels.states;
  const live = mode !== 'blueprint' && instance !== undefined;
  const moved = live ? change?.state : undefined;
  const modelChanged = live && (change?.model.length ?? 0) > 0;
  const propsChanged = live && (change?.props.length ?? 0) > 0;

  const fold = (
    key: string,
    title: ReactNode,
    folded: ReactNode,
    body: ReactNode,
    options: {
      readonly shut?: boolean;
      readonly kind?: Kind | undefined;
      /** Something in it runs now: teal, unless the Step changed it. */
      readonly active?: boolean;
    } = {},
  ) => {
    const shown = open === key && !options.shut;
    return (
      <li key={key} className={cn(options.shut && 'opacity-40')}>
        <button
          type="button"
          aria-expanded={options.shut ? undefined : shown}
          disabled={options.shut}
          onClick={() => setOpen(shown ? null : key)}
          className={cn(
            'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-2 pl-1 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            options.shut ? 'cursor-default' : 'hover:bg-muted/60',
            options.kind
              ? TINT[options.kind]
              : options.active
                ? ACTIVE
                : shown && 'bg-muted/50',
          )}
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
              shown && 'rotate-90',
              options.shut && 'invisible',
            )}
          />
          {title}
          {/* Folded, it says how much it holds; open, it shows it. */}
          {!shown && (
            <span className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground">
              {folded}
            </span>
          )}
        </button>
        {shown && body}
      </li>
    );
  };
  const fields = (value: unknown, shape: ReturnType<typeof schemaShape>) =>
    plural(
      live && typeof value === 'object' && value !== null
        ? Object.keys(value).length
        : fieldsOf(shape).length,
      'field',
    );
  const statesKind = live
    ? rollup(states.map((level) => kindsOf(level, node, live).all))
    : undefined;

  return (
    <ul className="flex flex-col gap-0.5">
      {fold(
        '*',
        <span className="shrink-0 text-xs font-medium">Always</span>,
        <Counts level={levels.always} node={node} live={live} />,
        <Opened
          level={levels.always}
          node={node}
          mode={mode}
          current
          {...(focus ? { focus } : {})}
          onChild={onChild}
        />,
        {
          kind: kindsOf(levels.always, node, live).all,
          active: activeIn(levels.always, node, live).any,
        },
      )}
      {levels.states.length > 0 && (
        <li className="pt-1.5">
          <p
            className={cn(
              'px-1 pb-0.5 text-[10px] font-medium tracking-wider uppercase',
              statesKind ? INK[statesKind] : 'text-muted-foreground',
            )}
          >
            States
          </p>
          <ul className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-1.5">
            {states.map((level) => {
              const here = level.key === current && live;
              return fold(
                level.key,
                <>
                  <Spot
                    on={focus?.kind === 'state' && focus.name === level.key}
                  >
                    <span
                      className={cn(
                        'shrink-0 font-mono text-xs',
                        here && 'font-semibold',
                      )}
                    >
                      {level.key}
                    </span>
                  </Spot>
                  {here && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {moved?.[1] === level.key ? `← ${moved[0]}` : ''}
                    </span>
                  )}
                </>,
                <Counts
                  level={level}
                  node={node}
                  live={live && level.key === current}
                />,
                <Opened
                  level={level}
                  node={node}
                  mode={mode}
                  current={level.key === current}
                  {...(focus ? { focus } : {})}
                  onChild={onChild}
                />,
                {
                  shut: mode === 'focus' && level.key !== current,
                  kind:
                    level.key === current
                      ? kindsOf(level, node, live).all
                      : undefined,
                  active:
                    level.key === current && activeIn(level, node, live).any,
                },
              );
            })}
          </ul>
        </li>
      )}
      {(model || instance?.model !== undefined) &&
        fold(
          'model',
          <span className="shrink-0 text-xs font-medium">Model</span>,
          <>
            {fields(instance?.model, model)}
            {modelChanged && (
              <span className="font-medium text-warning">
                {' '}
                · {change!.model.length}
              </span>
            )}
          </>,
          <div className="flex flex-col gap-2 pt-1 pb-3 pl-5">
            {modelChanged && change?.was && (
              <Diff
                before={encoded(encoding.model.encode, change.was.model)}
                after={encoded(encoding.model.encode, instance!.model)}
              />
            )}
            <Json
              value={
                live
                  ? encoded(encoding.model.encode, instance!.model)
                  : model
                    ? schemaJson(model)
                    : undefined
              }
            />
          </div>,
          { kind: modelChanged ? 'changed' : undefined },
        )}
      {(props || instance?.props !== undefined) &&
        fold(
          'props',
          <span className="shrink-0 text-xs font-medium">Props</span>,
          <>
            {fields(instance?.props, props)}
            {propsChanged && (
              <span className="font-medium text-warning">
                {' '}
                · {change!.props.length}
              </span>
            )}
          </>,
          <div className="flex flex-col gap-2 pt-1 pb-3 pl-5">
            {propsChanged && change?.was && (
              <Diff
                before={encoded(encoding.props.encode, change.was.props)}
                after={encoded(encoding.props.encode, instance!.props)}
              />
            )}
            <Json
              value={
                live
                  ? encoded(encoding.props.encode, instance!.props)
                  : props
                    ? schemaJson(props)
                    : undefined
              }
            />
          </div>,
          { kind: propsChanged ? 'changed' : undefined },
        )}
      {(node.print.requires.length > 0 || provides) &&
        fold(
          'capabilities',
          <span className="shrink-0 text-xs font-medium">Capabilities</span>,
          `uses ${node.print.requires.length}${provides ? ` · gives ${gives.length > 0 ? gives.length : '?'}` : ''}`,
          <div className="flex flex-col gap-3 pt-1 pb-3 pl-5">
            <section className="flex flex-col gap-1">
              <Label>Uses</Label>
              <Spot on={focus?.kind === 'requires'} className="p-0.5">
                <Names names={node.print.requires} />
              </Spot>
            </section>
            {provides && (
              <section className="flex flex-col gap-1">
                <Label>Gives</Label>
                <Spot on={focus?.kind === 'provides'} className="p-0.5">
                  {gives.length > 0 ? (
                    <Names names={gives} />
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </Spot>
              </section>
            )}
          </div>,
        )}
    </ul>
  );
}

const MODES: ReadonlyArray<readonly [Mode, string]> = [
  ['blueprint', 'Blueprint'],
  ['active', 'Active'],
  ['focus', 'Focus'],
];

// The card ----------------------------------------------------------------------

/** The open card's header: who it is, where it sits, what it is in, and the modes. Clicking it closes the card. */
function Head({
  node,
  mode,
  onMode,
  onClose,
}: {
  readonly node: GraphNode;
  readonly mode: Mode;
  readonly onMode: (mode: Mode) => void;
  readonly onClose: () => void;
}) {
  const running = node.instance !== undefined;
  const where = [
    node.print.name !== node.title ? node.print.name : undefined,
    node.condition && node.condition !== 'always' ? node.condition : undefined,
    node.within ? `in ${node.within}` : undefined,
  ].filter(Boolean);
  return (
    <div
      onClick={(event) => {
        // The band closes the card; its own buttons do their own thing.
        if (!(event.target as Element).closest('button')) onClose();
      }}
      className="flex cursor-pointer flex-col gap-2.5 border-b border-border bg-muted/50 px-3 pt-3 pb-2.5"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-base leading-tight font-semibold">
            {node.title}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {where.join(' · ')}
          </p>
        </div>
        {node.state && node.state !== 'Single' && (
          <Tag {...(node.change?.state ? { kind: 'changed' as const } : {})}>
            {node.state}
          </Tag>
        )}
        <button
          type="button"
          aria-label={`Close ${node.title}`}
          onClick={onClose}
          className="-mt-1 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      </div>
      {running && (
        <div
          role="tablist"
          aria-label="Mode"
          className="flex gap-0.5 rounded-lg bg-background/60 p-0.5"
        >
          {MODES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => onMode(value)}
              className={cn(
                'h-7 flex-1 rounded-md text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                mode === value
                  ? 'bg-card font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActorNode({
  placed,
  parent,
  size,
  focus,
  flash,
  onOpen,
  onCenter,
  onFold,
  onChild,
  onMeasure,
}: {
  readonly placed: Placed;
  /** Its parent's title, for the header. */
  readonly parent: string | undefined;
  readonly size: Size;
  readonly focus?: Part;
  /** A new number each time it is reached from its parent's card: it glows once. */
  readonly flash?: number;
  readonly onOpen: (id: string, open: boolean) => void;
  /** A right click: open it, if it is not, and bring it to the middle of the screen. */
  readonly onCenter: (id: string) => void;
  readonly onFold: (id: string, open: boolean) => void;
  readonly onChild: (parent: string, title: string) => void;
  /** The open card's height as drawn: the layout makes room for it. */
  readonly onMeasure: (id: string, height: number) => void;
}) {
  const { node } = placed;
  const open = size === 'open';
  const [mode, setMode] = useState<Mode>(
    node.instance ? 'active' : 'blueprint',
  );
  // Open, it is measured before it is painted, each time it draws, so the
  // layout is worked out once with its real height and moves once; what
  // grows without drawing it again, as its JSON opening, is heard after.
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (open && box.current) onMeasure(node.id, box.current.offsetHeight);
  });
  useEffect(() => {
    const element = box.current;
    if (!open || !element) return;
    const observer = new ResizeObserver(() =>
      onMeasure(node.id, element.offsetHeight),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, node.id, onMeasure]);
  const changed = node.change !== undefined || (node.gone?.length ?? 0) > 0;
  const levels = levelsOf(node);
  const here = [
    levels.always,
    ...levels.states.filter((level) => level.key === node.state),
  ];
  const workers = here.flatMap((level) => level.workers);
  const running = workers.filter((worker) =>
    isRunning(node, worker.name),
  ).length;
  const workersKind = rollup(
    workers.map((worker) => workerKind(node, worker.name)),
  );
  return (
    <motion.div
      data-node={node.id}
      initial={false}
      animate={{ x: placed.x, y: placed.y }}
      transition={CARD_SPRING}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCenter(node.id);
      }}
      className={cn('absolute top-0 left-0', (open || node.took) && 'z-20')}
    >
      {/* The Message the Step was for, called out from above, and what came of it. */}
      {node.took && node.instance && (
        <div className="pointer-events-none absolute bottom-full left-5 z-30 mb-0.5 flex flex-col items-start">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-lg border bg-popover px-2 py-1 whitespace-nowrap shadow-lg',
              tookChanged(node) ? 'border-warning/60' : 'border-border',
            )}
          >
            <span
              className={cn(
                'text-[10px] font-medium tracking-wider uppercase',
                tookChanged(node) ? 'text-warning' : 'text-muted-foreground',
              )}
            >
              {node.took.outcome === 'handled' ? 'took' : 'ignored'}
            </span>
            <span className="font-mono text-[11px] font-medium text-popover-foreground">
              {/* Kabuki's own Messages are named under its package: the last part says it. */}
              {node.took.message.split('/').at(-1)}
            </span>
            {!tookChanged(node) && (
              <span className="text-[10px] text-muted-foreground">
                {node.took.outcome === 'handled' ? 'no change' : 'no rule'}
              </span>
            )}
          </div>
          <svg
            aria-hidden
            width="16"
            height="14"
            viewBox="0 0 16 14"
            className={cn(
              'ml-3',
              tookChanged(node) ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            <path d="M8 0 V12" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M3.5 7.5 L8 12.5 L12.5 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      {/* Its width is set, never animated: text that wraps as it widens would
          change its height every frame, and the layout would chase it. */}
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border bg-card text-card-foreground transition-[border-color,box-shadow] duration-300 motion-reduce:transition-none',
          open ? 'shadow-xl' : 'shadow-sm',
          // Anything the Step changed in it, a Worker too, shows at its edge.
          // A change at its edge first; else, anything of its own running, in teal.
          changed
            ? 'border-warning/70 ring-2 ring-warning/15'
            : node.instance && running > 0
              ? 'border-chart-8/60 ring-2 ring-chart-8/10'
              : open
                ? 'border-foreground/25'
                : 'border-border',
        )}
        style={{
          width: open ? OPEN_WIDTH : SMALL.width,
          ...(open ? {} : { height: SMALL.height }),
        }}
      >
        {flash !== undefined && (
          <motion.span
            key={flash}
            aria-hidden
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-chart-8/15 ring-2 ring-chart-8 ring-inset"
          />
        )}
        <div ref={box}>
          {open ? (
            <>
              <Head
                node={node}
                mode={mode}
                onMode={setMode}
                onClose={() => onOpen(node.id, false)}
              />
              <div className="px-2 pt-2 pb-1">
                <Sections
                  key={`${mode}:${JSON.stringify(focus ?? null)}`}
                  node={node}
                  mode={node.instance ? mode : 'blueprint'}
                  {...(focus ? { focus } : {})}
                  onChild={(title) => onChild(node.id, title)}
                />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpen(node.id, true)}
              aria-expanded={false}
              aria-label={`${node.title}${changed ? ', changed at this Step' : ''}`}
              className="flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {node.title}
                </span>
                {node.state && node.state !== 'Single' && (
                  <span className="ml-auto">
                    <Tag
                      {...(node.change?.state
                        ? { kind: 'changed' as const }
                        : {})}
                    >
                      {node.state}
                    </Tag>
                  </span>
                )}
              </span>
              <span className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {node.print.name !== node.title ? node.print.name : ' '}
                  {node.within ? ` · in ${node.within}` : ''}
                </span>
                {node.instance && workers.length > 0 && (
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded px-1.5 text-[11px] tabular-nums',
                      workersKind ? TINT[workersKind] : running > 0 && RUNNING,
                    )}
                  >
                    {running}/{workers.length}
                  </span>
                )}
              </span>
            </button>
          )}
        </div>
      </div>
      {node.children.length > 0 && !open && (
        <button
          type="button"
          aria-label={
            placed.hidden > 0
              ? `Show the ${placed.hidden} under ${node.title}`
              : `Fold what is under ${node.title}`
          }
          onClick={() => onFold(node.id, placed.hidden > 0)}
          className="absolute top-[29px] -right-3 z-10 flex h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background px-1.5 font-mono text-[11px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          {placed.hidden > 0 ? `+${placed.hidden}` : '−'}
        </button>
      )}
    </motion.div>
  );
}
