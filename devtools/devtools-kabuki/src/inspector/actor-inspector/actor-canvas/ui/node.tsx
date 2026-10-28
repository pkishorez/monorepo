import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowRightIcon,
  ChevronRightIcon,
  LayersIcon,
  MailIcon,
  PlugIcon,
  XIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { JsonTree } from '@kestack/web-platform/ui/viewers/json';
import type * as Api from '../../../../api/index.ts';
import type { Placed } from './layout.ts';
import { depthFor, fieldsOf, schemaJson, textOf } from './shape.ts';
import { CARD_SPRING } from './space.ts';

type GraphNode = Api.GraphNode;
type Condition = Api.GraphNode['condition'] & string;
type Field = Api.Field;
/** A Child as its parent's Blueprint writes it. */
type SlotPrint = Api.GraphNode['blueprint']['top']['children'][number];

/*
 * One Actor on the canvas, in two greys, the card and its header band,
 * and four colours, each saying one thing (./styles.css):
 *
 *   blue   running: a Worker that runs, a Child that is there. It is the
 *          base: a change's colour wins over it.
 *   green  the Step added it: a Worker started, a Child invoked.
 *   amber  the Step changed it: its State, its Model, a Message it took.
 *   red    the Step took it away: a Worker stopped, a Child stopped.
 *
 * A row tints, with a short bar set in at its edge, as a diff's line
 * would; a Child's chip only tints. What holds it says so once, in its
 * text: a section's title takes the colour of what changed in it, or blue
 * while it is active, as the State it is in; a card has a stripe at its
 * edge, its border staying grey. No dots anywhere. So a Step that touched
 * much never floods the canvas. A card's own colour is the
 * one its changes roll up to, red only when all went, green when all came,
 * amber for the rest. The card whose Message it was carries it on its top
 * edge, a tab named for the Message: amber when it changed the card, grey
 * when it changed nothing or no rule took it.
 *
 * An open card's data, its State's fields, its Model and Props and what
 * the Step did to them, and the fields each Message carries, is the
 * Kabuki Session's answer for it (`card`), read while it is open.
 *
 * Small, a card says its slot and its State on one line, what Actor it is
 * and how many Workers run on the next, and the key it is made again by,
 * if it has one, on a third, made readable: a list of ids by its parts,
 * a long id by its start and end, the whole on hover. Open,
 * it is laid out at its own size, so its Children move aside; its header
 * closes it again. Running, it shows what it is now: Always and the one
 * State it is in, its Model and Props as values; one switch in its header
 * shows its other States too, dimmed. Not running, as in a Story, it shows
 * everything it can be: every State, its Model and Props as Schemas.
 */

export type Size = 'small' | 'open';

/** The part of a card lit: a Capability picked, in the cards that share it. */
export type Part =
  | { readonly kind: 'state'; readonly name: string }
  | { readonly kind: 'worker'; readonly name: string }
  | { readonly kind: 'message'; readonly name: string; readonly state?: string }
  | { readonly kind: 'child'; readonly name: string }
  | { readonly kind: 'model' }
  | { readonly kind: 'props' }
  | { readonly kind: 'requires'; readonly name?: string }
  | { readonly kind: 'provides'; readonly name?: string };

export const SMALL = { width: 220, height: 58 } as const;
/** A small card with a key: one line taller, for the key. */
export const SMALL_KEYED = { width: SMALL.width, height: 78 } as const;

/**
 * Where a card's lines leave and arrive, and its fold button sits, down
 * from its top: a small card's middle; an open card's header.
 */
export const anchorOf = (card: {
  readonly width: number;
  readonly height: number;
}) => (card.width === OPEN_WIDTH ? 29 : card.height / 2);
export const OPEN_WIDTH = 408;

/** What came of the Message a card took: it changed the card, or it did not. */
const tookChanged = (node: GraphNode) =>
  node.took?.outcome === 'handled' && node.change !== undefined;

/** A line's style, by when the Child exists: solid, dashed, dotted. */
export const DASH: Record<Condition, string | undefined> = {
  always: undefined,
  while: '6 5',
  each: '1.5 4',
};

/** Everything it can be; what it is now; what it is now, its other States beside it. */
type Mode = 'blueprint' | 'active' | 'all';

// Colours ----------------------------------------------------------------------

type Kind = 'added' | 'changed' | 'removed';

/**
 * A row the Step touched: tinted, with a short straight bar set in at its
 * leading edge, clear of the row's rounded corners.
 */
const TINT: Record<Kind, string> = {
  added:
    'relative bg-added/10 before:absolute before:inset-y-1.5 before:left-0.5 before:w-0.5 before:rounded-full before:bg-added',
  changed:
    'relative bg-changed/10 before:absolute before:inset-y-1.5 before:left-0.5 before:w-0.5 before:rounded-full before:bg-changed',
  removed:
    'relative bg-removed/10 before:absolute before:inset-y-1.5 before:left-0.5 before:w-0.5 before:rounded-full before:bg-removed',
};

/** A chip the Step touched, a Child: tinted and in its colour, no bar. */
const CHIP: Record<Kind, string> = {
  added: 'bg-added/10 text-added',
  changed: 'bg-changed/10 text-changed',
  removed: 'bg-removed/10 text-removed',
};

const INK: Record<Kind, string> = {
  added: 'text-added',
  changed: 'text-changed',
  removed: 'text-removed',
};

const FILL: Record<Kind, string> = {
  added: 'bg-added',
  changed: 'bg-changed',
  removed: 'bg-removed',
};

/** Running, softly: what is active now, under any change. */
const RUNNING = 'bg-running/[0.07]';
const ACTIVE_INK = 'font-medium text-running';

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

/** What the Step did to a card, all told: what it is the colour of. */
const cardKind = (node: GraphNode): Kind | undefined => {
  const { change } = node;
  if (change?.kind === 'added' || change?.kind === 'removed')
    return change.kind;
  return (
    rollup([
      ...(change?.state || change?.model.length || change?.props.length
        ? (['changed'] as const)
        : []),
      ...(change?.started ?? []).map(() => 'added' as const),
      ...(change?.stopped ?? []).map(() => 'removed' as const),
      ...(node.gone ?? []).map(() => 'removed' as const),
    ]) ?? (change ? 'changed' : undefined)
  );
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
        kind
          ? cn('bg-current/12 font-medium', INK[kind])
          : 'border border-border bg-background/60',
      )}
    >
      {children}
    </span>
  );
}

/** A section's heading, always grey: the section's dot says what changed in it. */
function Label({ children }: { readonly children: ReactNode }) {
  return (
    <h4 className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </h4>
  );
}

/**
 * A part a Scene points at. While it does, a ring closes in around it and
 * it grows a little, without moving anything near it; when the Scene
 * moves on, the ring opens out and fades.
 */
function Spot({
  on,
  wide = false,
  className,
  children,
}: {
  readonly on: boolean;
  /**
   * As wide as the card: a row, a block. It does not grow and its ring
   * sits on its edge, so neither reaches past the card, which would cut
   * them off.
   */
  readonly wide?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <span
      data-focus={on || undefined}
      className={cn(
        'relative rounded-md transition-transform duration-300 ease-out motion-reduce:transition-none',
        on && 'z-10',
        on && !wide && 'scale-[1.04]',
        className,
      )}
    >
      <AnimatePresence>
        {on && (
          <motion.span
            aria-hidden
            initial={{ opacity: 0, scale: 1.18 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              'pointer-events-none absolute rounded-lg ring-2 ring-foreground/85 shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-foreground)_10%,transparent)]',
              wide ? 'inset-0' : '-inset-1',
            )}
          />
        )}
      </AnimatePresence>
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

/**
 * A Message by its tag alone; the fields it carries are a hover away, and
 * a mark says it has any, so the row stays one short line.
 */
function Carries({
  name,
  fields,
}: {
  readonly name: string;
  readonly fields: ReadonlyArray<Field> | undefined;
}) {
  const carried = fields?.map((field) => field.name) ?? [];
  return (
    <span
      title={carried.length > 0 ? `${name}(${carried.join(', ')})` : name}
      className="min-w-0 truncate font-mono text-xs"
    >
      {name}
      {carried.length > 0 && (
        <span className="text-muted-foreground/70">(…)</span>
      )}
    </span>
  );
}

/** A Capability an Actor requires, and the card above it that provides it: null for a Service, which the app's Layer hands in. */
export interface Use {
  readonly name: string;
  readonly from: string | null;
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
  const { blueprint: print, known } = node;
  const onlyIn = (worker: {
    readonly name: string;
    readonly condition: Condition;
  }) => {
    if (worker.condition === 'always') return null;
    const states = known?.ran[worker.name];
    return states && states.length === 1 ? states[0]! : null;
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
  node.workers.find((one) => one.name === worker)?.keys ?? [];

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
    case 'model':
    case 'props':
      return part.kind;
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
  card,
  tag,
}: {
  readonly card: Api.Node | undefined;
  readonly tag: string;
}) {
  const fields = card?.schemas.states[tag] ?? [];
  if (fields.length === 0) return null;
  const state = card?.state as Readonly<Record<string, unknown>> | undefined;
  const now = state?.['_tag'] === tag ? state : undefined;
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

/**
 * Capabilities by name, one of them lit; each one picked, given `onPick`.
 * A Service, handed in by the app's Layer rather than an Actor of the
 * tree, is dashed and grey.
 */
function Names({
  names,
  side,
  lit,
  onPick,
}: {
  readonly names: ReadonlyArray<string>;
  readonly side: 'provides' | 'requires' | 'service';
  readonly lit?: string | undefined;
  readonly onPick?: ((name: string) => void) | undefined;
}) {
  const look = cn(
    'inline-flex h-6 items-center rounded-md border px-2 text-[11px]',
    {
      provides: 'border-border bg-muted/40',
      requires: 'border-border bg-muted/40',
      service: 'border-dashed border-border text-muted-foreground',
    }[side],
  );
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <Spot key={name} on={lit === name}>
          {onPick ? (
            <button
              type="button"
              title={`Who shares ${name}`}
              onClick={() => onPick(name)}
              className={cn(
                look,
                'outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                'hover:bg-muted',
              )}
            >
              {name}
            </button>
          ) : (
            <span className={look}>{name}</span>
          )}
        </Spot>
      ))}
    </div>
  );
}

/** A level open: everything written in it. */
function Opened({
  level,
  node,
  card,
  mode,
  focus,
  onChild,
}: {
  readonly level: Level;
  readonly node: GraphNode;
  readonly card: Api.Node | undefined;
  readonly mode: Mode;
  readonly focus?: Part;
  readonly onChild: (title: string) => void;
}) {
  const live = mode !== 'blueprint';
  const messages = card?.schemas.messages ?? {};
  const gone = live
    ? (node.gone ?? []).filter((one) =>
        level.children.some((child) => child.name === one.slot),
      )
    : [];
  return (
    <div className="flex flex-col gap-3 pt-1 pb-3 pl-5">
      {level.key !== '*' && <StateFields card={card} tag={level.key} />}
      {level.workers.length > 0 && (
        <section className="flex flex-col gap-1">
          <Label>Workers</Label>
          <ul className="flex flex-col gap-0.5">
            {level.workers.map((worker) => {
              const keys = keysOf(node, worker.name);
              const on = live && keys.length > 0;
              const kind = live ? workerKind(node, worker.name) : undefined;
              return (
                <li key={worker.name} className={cn()}>
                  <Spot
                    wide
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
          <Label>Handles</Label>
          <ul className="flex flex-col gap-0.5">
            {level.on.map((message) => {
              const took = live && node.took?.message === message.name;
              return (
                <li key={message.name}>
                  <Spot
                    wide
                    on={
                      focus?.kind === 'message' &&
                      focus.name === message.name &&
                      (focus.state ?? '*') === level.key
                    }
                    className={cn(
                      'flex h-7 min-w-0 items-center gap-2 px-2',
                      took &&
                        (tookChanged(node)
                          ? TINT.changed
                          : 'relative bg-muted/60 before:absolute before:inset-y-1.5 before:left-0.5 before:w-0.5 before:rounded-full before:bg-muted-foreground/40'),
                    )}
                  >
                    <Carries
                      name={message.name}
                      fields={messages[message.name]}
                    />
                    {message.to.length > 0 && (
                      <span className="flex min-w-0 shrink items-center gap-1 text-[11px] text-muted-foreground">
                        <ArrowRightIcon
                          aria-hidden
                          className="size-3 shrink-0"
                        />
                        <span className="truncate font-mono">
                          {message.to.join(', ')}
                        </span>
                      </span>
                    )}
                    {took && (
                      <span
                        className={cn(
                          'ml-auto shrink-0 text-[11px]',
                          tookChanged(node)
                            ? 'font-medium text-changed'
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
          <Label>Children</Label>
          <div className="flex flex-wrap gap-1">
            {level.children.map((child) => {
              const there = childOf(node, child.name);
              // Running, a Child its Condition does not hold for now is not there.
              const absent = there === undefined;
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
                          ? CHIP[kind]
                          : live
                            ? 'border border-running/30 bg-running/[0.07] hover:bg-running/15'
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
                  CHIP.removed,
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
          <Label>Provides</Label>
          <Names names={level.gives} side="provides" />
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
  rows,
}: {
  readonly rows: ReadonlyArray<typeof Api.DiffRow.Type>;
}) {
  const added = rows.filter((row) => row.kind === 'added').length;
  const removed = rows.filter((row) => row.kind === 'removed').length;
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        <span className="ml-auto font-mono tracking-normal text-added normal-case">
          +{added}
        </span>
        <span className="font-mono tracking-normal text-removed normal-case">
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
                  row.kind === 'removed' && 'bg-removed/10',
                  row.kind === 'added' && 'bg-added/10',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'w-5 shrink-0 text-center select-none',
                    row.kind === 'removed'
                      ? 'text-removed'
                      : row.kind === 'added'
                        ? 'text-added'
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

// The sections ----------------------------------------------------------------

function Sections({
  node,
  card,
  mode,
  focus,
  onChild,
  uses,
  services,
  onCapability,
}: {
  readonly node: GraphNode;
  readonly card: Api.Node | undefined;
  readonly mode: Mode;
  readonly focus?: Part;
  readonly onChild: (title: string) => void;
  readonly uses: ReadonlyArray<Use>;
  /** Whether the Services it requires show, beside the Capabilities. */
  readonly services: boolean;
  /** A Capability it requires or provides, picked: who shares it is shown. */
  readonly onCapability: (name: string, side: 'requires' | 'provides') => void;
}) {
  const levels = levelsOf(node);
  const current = node.state;
  // Any number open at once; at first, the one a Scene points into, or
  // the State it is in.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const first =
      sectionOfPart(levels, focus) ??
      (mode === 'blueprint' ? undefined : (current ?? '*'));
    return new Set(first === undefined ? [] : [first]);
  });
  // A new Scene's part opens the section it is in, beside what was open.
  const [pointed, setPointed] = useState(focus);
  if (pointed !== focus) {
    setPointed(focus);
    const section = sectionOfPart(levels, focus);
    if (section !== undefined && !open.has(section))
      setOpen(new Set(open).add(section));
  }
  const flip = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const model = card?.schemas.model;
  const props = card?.schemas.props;
  const { change } = node;
  const diff = card?.change?.diff;
  const gives = [
    ...new Set([
      ...(node.known?.gives.top ?? []),
      ...Object.values(node.known?.gives.state ?? {}).flat(),
    ]),
  ];
  // What it requires, split: Capabilities an Actor above provides, and
  // Services the app's Layer hands in; a Service shows when asked for, or
  // when a Scene points at it.
  const needs = uses.filter((use) => use.from !== null).map(({ name }) => name);
  const shownServices = uses
    .filter(
      (use) =>
        use.from === null &&
        (services || (focus?.kind === 'requires' && focus.name === use.name)),
    )
    .map(({ name }) => name);
  // Active shows only the State it is in.
  const states =
    mode === 'active'
      ? levels.states.filter((level) => level.key === current)
      : levels.states;
  const live = mode !== 'blueprint';
  const moved = live ? change?.state : undefined;
  const modelChanged = live && (change?.model.length ?? 0) > 0;
  const propsChanged = live && (change?.props.length ?? 0) > 0;

  const fold = (
    key: string,
    title: ReactNode,
    folded: ReactNode,
    body: ReactNode,
    options: {
      /** Not the State it is in: dimmed, still to open. */
      readonly dim?: boolean;
      readonly kind?: Kind | undefined;
      /** Something in it runs now: teal, unless the Step changed it. */
      readonly active?: boolean;
    } = {},
  ) => {
    const shown = open.has(key);
    const tone = options.kind
      ? INK[options.kind]
      : options.active
        ? 'text-running'
        : undefined;
    return (
      <li key={key} className={cn(options.dim && 'opacity-50')}>
        <button
          type="button"
          aria-expanded={shown}
          onClick={() => flip(key)}
          className={cn(
            'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-2 pl-1 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            'hover:bg-muted/60',
          )}
        >
          {/* Its chevron and its title in a change's colour; else blue while it is active. */}
          <ChevronRightIcon
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none',
              shown && 'rotate-90',
              tone ?? 'text-muted-foreground',
            )}
          />
          <span className={cn('flex min-w-0 items-center', tone)}>{title}</span>
          {/* Folded or open, it says how much it holds: the row keeps its size. */}
          <span className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground">
            {folded}
          </span>
        </button>
        {shown && body}
      </li>
    );
  };
  const fields = (value: unknown, shape: Api.Shape | undefined) =>
    plural(
      live && typeof value === 'object' && value !== null
        ? Object.keys(value).length
        : fieldsOf(shape).length,
      'field',
    );

  return (
    // A Scene's part lit, every row that does not hold it dims.
    <ul
      className={cn(
        'flex flex-col gap-0.5',
        focus &&
          '[&_li]:transition-opacity [&_li]:duration-300 [&_li:not(:has([data-focus]))]:opacity-35',
      )}
    >
      {fold(
        '*',
        <span className="shrink-0 text-xs font-medium">Always</span>,
        <Counts level={levels.always} node={node} live={live} />,
        <Opened
          level={levels.always}
          node={node}
          card={card}
          mode={mode}
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
          <p className="px-1 pb-0.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            States
          </p>
          <ul className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-1.5">
            {states.map((level) => {
              const here = level.key === current && live;
              return fold(
                level.key,
                // The State the Step moved it into reads as the move: from → to.
                <Spot
                  on={focus?.kind === 'state' && focus.name === level.key}
                  className="flex shrink-0 items-center gap-1.5 font-mono text-xs"
                >
                  {here && moved?.[1] === level.key && (
                    <>
                      <span className="text-muted-foreground line-through decoration-muted-foreground/60">
                        {moved[0]}
                      </span>
                      <ArrowRightIcon
                        aria-label="moved to"
                        className="size-3 text-changed"
                      />
                    </>
                  )}
                  <span className={cn(here && 'font-semibold')}>
                    {level.key}
                  </span>
                </Spot>,
                <Counts
                  level={level}
                  node={node}
                  live={live && level.key === current}
                />,
                <Opened
                  level={level}
                  node={node}
                  card={card}
                  mode={mode}
                  {...(focus ? { focus } : {})}
                  onChild={onChild}
                />,
                {
                  dim: mode === 'all' && level.key !== current,
                  kind:
                    level.key === current
                      ? kindsOf(level, node, live).all
                      : undefined,
                  // The State it is in is active, whatever runs in it.
                  active: live && level.key === current,
                },
              );
            })}
          </ul>
        </li>
      )}
      {card &&
        (model || card.model !== undefined) &&
        fold(
          'model',
          <span className="shrink-0 text-xs font-medium">Model</span>,
          <>
            {fields(card.model, model)}
            {modelChanged && (
              <span className="font-medium text-changed">
                {' '}
                · {change!.model.length}
              </span>
            )}
          </>,
          <Spot
            wide
            on={focus?.kind === 'model'}
            className="flex flex-col gap-2 pt-1 pb-3 pl-5"
          >
            {modelChanged && diff && <Diff rows={diff.model} />}
            <Json
              value={live ? card.model : model ? schemaJson(model) : undefined}
            />
          </Spot>,
          { kind: modelChanged ? 'changed' : undefined },
        )}
      {card &&
        (props || card.props !== undefined) &&
        fold(
          'props',
          <span className="shrink-0 text-xs font-medium">Props</span>,
          <>
            {fields(card.props, props)}
            {propsChanged && (
              <span className="font-medium text-changed">
                {' '}
                · {change!.props.length}
              </span>
            )}
          </>,
          <Spot
            wide
            on={focus?.kind === 'props'}
            className="flex flex-col gap-2 pt-1 pb-3 pl-5"
          >
            {propsChanged && diff && <Diff rows={diff.props} />}
            <Json
              value={live ? card.props : props ? schemaJson(props) : undefined}
            />
          </Spot>,
          { kind: propsChanged ? 'changed' : undefined },
        )}
      {(needs.length > 0 || shownServices.length > 0 || gives.length > 0) &&
        fold(
          'capabilities',
          <span className="shrink-0 text-xs font-medium">Capabilities</span>,
          [
            needs.length > 0 && `requires ${needs.length}`,
            shownServices.length > 0 && plural(shownServices.length, 'service'),
            gives.length > 0 && `provides ${gives.length}`,
          ]
            .filter(Boolean)
            .join(' · '),
          <div className="flex flex-col gap-3 pt-1 pb-3 pl-5">
            {needs.length > 0 && (
              <section className="flex flex-col gap-1">
                <Label>Requires</Label>
                <Spot
                  wide
                  on={focus?.kind === 'requires' && focus.name === undefined}
                  className="p-0.5"
                >
                  <Names
                    names={needs}
                    side="requires"
                    lit={focus?.kind === 'requires' ? focus.name : undefined}
                    onPick={(name) => onCapability(name, 'requires')}
                  />
                </Spot>
              </section>
            )}
            {shownServices.length > 0 && (
              <section className="flex flex-col gap-1">
                <Label>Services</Label>
                <Names
                  names={shownServices}
                  side="service"
                  lit={focus?.kind === 'requires' ? focus.name : undefined}
                  onPick={(name) => onCapability(name, 'requires')}
                />
              </section>
            )}
            {gives.length > 0 && (
              <section className="flex flex-col gap-1">
                <Label>Provides</Label>
                <Spot
                  wide
                  on={focus?.kind === 'provides' && focus.name === undefined}
                  className="p-0.5"
                >
                  <Names
                    names={gives}
                    side="provides"
                    lit={focus?.kind === 'provides' ? focus.name : undefined}
                    onPick={(name) => onCapability(name, 'provides')}
                  />
                </Spot>
              </section>
            )}
          </div>,
        )}
    </ul>
  );
}

// The card ----------------------------------------------------------------------

/** A quiet switch in a card's header, an icon named on hover: what more it shows. */
function Switch({
  on,
  onChange,
  name,
  children,
}: {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
  readonly name: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={name}
      title={name}
      onClick={() => onChange(!on)}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&_svg]:size-3.5',
        on
          ? 'border-foreground/20 bg-background text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** A card's Child name, and the key it is made again by, if it has one: `machines #local_…`. */
export const nameOf = (node: GraphNode) => {
  const [name = node.title, ...rest] = node.title.split(' #');
  return { name, key: rest.length > 0 ? rest.join(' #') : undefined };
};

/** How big a card is, small: one line taller with a key to show. */
export const smallOf = (node: GraphNode) =>
  nameOf(node).key === undefined ? SMALL : SMALL_KEYED;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One id as a person reads it: a UUID by its first eight, as a commit is; a long one by its start and end. */
const readableId = (id: string) =>
  UUID.test(id)
    ? id.slice(0, 8)
    : id.length > 22
      ? `${id.slice(0, 10)}…${id.slice(-8)}`
      : id;

/**
 * A key as a person reads it: a list, as an `each` keyed by several ids
 * is, by its parts in order; else the one id.
 */
export const readableKey = (key: string): string => {
  try {
    const parsed: unknown = JSON.parse(key);
    if (Array.isArray(parsed))
      return parsed.map((part) => readableId(String(part))).join(' / ');
    if (typeof parsed === 'string') return readableId(parsed);
  } catch {}
  return readableId(key);
};

/**
 * The open card's header, each thing on its own line and the controls
 * centred beside them: its name; what Actor it is, when and where it
 * exists; the key it is made again by. Then the State it is in, as a
 * label, and two icon switches, its other States and its Services.
 * Clicking the band closes the card.
 */
function Head({
  node,
  all,
  onAll,
  services,
  onServices,
  onClose,
}: {
  readonly node: GraphNode;
  readonly all: boolean;
  readonly onAll: (all: boolean) => void;
  /** Whether its Services show; undefined when it requires none. */
  readonly services: boolean | undefined;
  readonly onServices: (services: boolean) => void;
  readonly onClose: () => void;
}) {
  // Only a running card with more than one State has others to show.
  const others = node.blueprint.states.length > 1;
  const { name, key } = nameOf(node);
  const where = [
    node.actor !== name ? node.actor : undefined,
    node.condition && node.condition !== 'always' ? node.condition : undefined,
    node.within ? `in ${node.within}` : undefined,
  ].filter(Boolean);
  return (
    <div
      onClick={(event) => {
        // The band closes the card; its own buttons do their own thing.
        if (!(event.target as Element).closest('button')) onClose();
      }}
      className="flex cursor-pointer items-center gap-2 border-b border-border bg-muted/50 py-2.5 pr-2 pl-3"
    >
      {/* Who it is: its name; what it is and where; the key it is made again by. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-base leading-tight font-semibold">
          {name}
        </h3>
        {where.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {where.join(' · ')}
          </p>
        )}
        {key && (
          <p
            title={key}
            className="truncate font-mono text-[11px] text-muted-foreground/80"
          >
            #{key}
          </p>
        )}
      </div>
      {node.state && node.state !== 'Single' && (
        <span title={`In the State ${node.state}`} className="flex shrink-0">
          <Tag {...(node.change?.state ? { kind: 'changed' as const } : {})}>
            {node.state}
          </Tag>
        </span>
      )}
      {(others || services !== undefined) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {others && (
            <Switch on={all} onChange={onAll} name="Show all its States">
              <LayersIcon aria-hidden />
            </Switch>
          )}
          {services !== undefined && (
            <Switch
              on={services}
              onChange={onServices}
              name="Show its Services"
            >
              <PlugIcon aria-hidden />
            </Switch>
          )}
        </div>
      )}
      <button
        type="button"
        aria-label={`Close ${name}`}
        title="Close"
        onClick={onClose}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <XIcon aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function ActorNode({
  placed,
  card,
  size,
  focus,
  dim = false,
  still = false,
  flash,
  onOpen,
  onCenter,
  onFold,
  onChild,
  uses,
  onCapability,
  onMeasure,
}: {
  readonly placed: Placed;
  /** The Kabuki Session's answer for it, once read: an open card's data. */
  readonly card: Api.Node | undefined;
  readonly size: Size;
  readonly focus?: Part;
  /** Out of a Story's spotlight: drawn faint, so what it is about stands out. */
  readonly dim?: boolean;
  /** Out of sight, before the canvas is drawn: in place at once, nothing glides or fades in. */
  readonly still?: boolean;
  /** A new number each time it is reached from its parent's card: it glows once. */
  readonly flash?: number;
  readonly onOpen: (id: string, open: boolean) => void;
  /** A right click: open it, if it is not, and bring it to the middle of the screen. */
  readonly onCenter: (id: string) => void;
  readonly onFold: (id: string, open: boolean) => void;
  readonly onChild: (parent: string, title: string) => void;
  /** What it requires, each with the card that provides it. */
  readonly uses: ReadonlyArray<Use>;
  /** A Capability the card requires or provides, picked. */
  readonly onCapability: (
    id: string,
    name: string,
    side: 'requires' | 'provides',
  ) => void;
  /** The open card's height as drawn: the layout makes room for it. */
  readonly onMeasure: (id: string, height: number) => void;
}) {
  const { node } = placed;
  const open = size === 'open';
  const [all, setAll] = useState(false);
  const [services, setServices] = useState(false);
  const mode: Mode = all ? 'all' : 'active';
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
    // Heard before the frame is painted, and laid out at once: else the card
    // is drawn grown over its neighbours for a frame before they move.
    const observer = new ResizeObserver(() =>
      flushSync(() => onMeasure(node.id, element.offsetHeight)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, node.id, onMeasure]);
  const changed = node.change !== undefined || (node.gone?.length ?? 0) > 0;
  const kind = cardKind(node);
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
      // A card the Step invoked fades in where it lands; the rest glide.
      initial={
        node.change?.kind === 'added' && !still
          ? { x: placed.x, y: placed.y, opacity: 0, scale: 0.96 }
          : false
      }
      animate={{ x: placed.x, y: placed.y, opacity: dim ? 0.25 : 1, scale: 1 }}
      transition={
        still
          ? { duration: 0 }
          : { ...CARD_SPRING, opacity: { duration: 0.3, ease: 'easeOut' } }
      }
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCenter(node.id);
      }}
      className={cn('absolute top-0 left-0', (open || node.took) && 'z-20')}
    >
      {/* The Message the Step was for, a tab on the card's top edge, and what came of it. */}
      {node.took && (
        <div
          className={cn(
            'pointer-events-none absolute -top-2.5 left-3 z-30 flex h-5 max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border bg-card px-2 text-[11px] whitespace-nowrap shadow-sm',
            tookChanged(node)
              ? 'border-changed/50 text-changed'
              : 'border-border text-muted-foreground',
          )}
        >
          <MailIcon aria-hidden className="size-3 shrink-0" />
          <span className="truncate font-mono font-medium text-foreground">
            {/* Kabuki's own Messages are named under its package: the last part says it. */}
            {node.took.message.split('/').at(-1)}
          </span>
          {!tookChanged(node) && (
            <span className="shrink-0">
              {node.took.outcome === 'handled' ? 'no change' : 'no rule'}
            </span>
          )}
        </div>
      )}
      {/* Its width is set, never animated: text that wraps as it widens would
          change its height every frame, and the layout would chase it. */}
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border bg-card text-card-foreground transition-[border-color] duration-300 motion-reduce:transition-none',
          open ? 'shadow-lg' : 'shadow-xs',
          open ? 'border-foreground/15' : 'border-border',
        )}
        style={{
          width: open ? OPEN_WIDTH : SMALL.width,
          ...(open ? {} : { height: smallOf(node).height }),
        }}
      >
        {/* Its one mark, a stripe set in from its corners: the colour of what
            the Step did to it, else blue while its Workers run. */}
        {(kind || running > 0) && (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-2.5 left-0 z-10 w-[3px] rounded-r-full',
              kind ? FILL[kind] : 'bg-running/70',
            )}
          />
        )}
        {flash !== undefined && (
          <motion.span
            key={flash}
            aria-hidden
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-running/15 ring-2 ring-running ring-inset"
          />
        )}
        <div ref={box}>
          {open ? (
            <>
              <Head
                node={node}
                all={all}
                onAll={setAll}
                services={
                  uses.some((use) => use.from === null) ? services : undefined
                }
                onServices={setServices}
                onClose={() => onOpen(node.id, false)}
              />
              <div className="px-2 pt-2 pb-1">
                <Sections
                  key={mode}
                  node={node}
                  card={card}
                  mode={mode}
                  {...(focus ? { focus } : {})}
                  onChild={(title) => onChild(node.id, title)}
                  uses={uses}
                  services={services}
                  onCapability={(name, side) =>
                    onCapability(node.id, name, side)
                  }
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
              {/* Who it is, and the State it is in. */}
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-sm font-medium">
                  {nameOf(node).name}
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
              {/* What Actor it is and where, and its Workers running. */}
              <span className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {[
                    node.actor !== nameOf(node).name ? node.actor : undefined,
                    node.within ? `in ${node.within}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '\u00a0'}
                </span>
                {workers.length > 0 && (
                  <span
                    title={`${running} of ${plural(workers.length, 'Worker')} running`}
                    className={cn(
                      'ml-auto flex shrink-0 items-center gap-1 text-[11px] tabular-nums',
                      workersKind
                        ? cn('font-medium', INK[workersKind])
                        : running > 0 && ACTIVE_INK,
                    )}
                  >
                    {running}/{workers.length}
                  </span>
                )}
              </span>
              {/* The key it is made again by, readable; the whole on hover. */}
              {nameOf(node).key && (
                <span
                  title={nameOf(node).key}
                  className="flex w-full min-w-0 items-center gap-1.5 text-[11px]"
                >
                  <span className="shrink-0 text-muted-foreground/70">key</span>
                  <span className="min-w-0 truncate font-mono text-muted-foreground">
                    {readableKey(nameOf(node).key!)}
                  </span>
                </span>
              )}
            </button>
          )}
        </div>
      </div>
      {/* Open or not, a card folds and unfolds what is under it: beside it,
          clear of what it says, where its lines leave. */}
      {node.children.length > 0 && (
        <button
          type="button"
          aria-label={
            placed.hidden > 0
              ? `Show the ${placed.hidden} under ${node.title}`
              : `Fold what is under ${node.title}`
          }
          onClick={() => onFold(node.id, placed.hidden > 0)}
          // Easy to hit: larger than it looks, its reach running past its edge.
          style={{
            top: anchorOf(
              open ? { width: OPEN_WIDTH, height: 0 } : smallOf(node),
            ),
          }}
          className="absolute left-full z-10 ml-1.5 flex h-8 min-w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background px-2 font-mono text-xs font-medium text-muted-foreground outline-none transition-[color,background-color,scale] duration-150 ease-out before:absolute before:-inset-2 before:content-[''] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.94] motion-reduce:transition-none"
        >
          {placed.hidden > 0 ? `+${placed.hidden}` : '−'}
        </button>
      )}
    </motion.div>
  );
}
