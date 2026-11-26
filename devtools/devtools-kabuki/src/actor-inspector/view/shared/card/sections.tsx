import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  activeIn,
  childKind,
  childOf,
  fieldsOf,
  givesOf,
  isEmpty,
  keysOf,
  kindsOf,
  levelsOf,
  needsOf,
  schemaJson,
  sectionOfPart,
  servicesOf,
  textOf,
  tookChanged,
} from '../../../logic/shared/index.ts';
import type {
  Card,
  CardLevel,
  Kind,
  Mode,
  Opened,
  Part,
  Shape,
} from '../../../logic/shared/index.ts';
import { useCard } from './context.ts';
import {
  ACTIVE_INK,
  CHIP,
  INK,
  Json,
  Label,
  RUNNING,
  Spot,
  TINT,
  brief,
  plural,
} from './marks.tsx';

type Data = Opened | null | undefined;

function Carries({
  name,
  payload,
}: {
  readonly name: string;
  readonly payload: Shape;
}) {
  const carried = fieldsOf(payload).map((field) => field.name);
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

function Counts({
  level,
  card,
  opened,
  live,
}: {
  readonly level: CardLevel;
  readonly card: Card;
  readonly opened: Data;
  readonly live: boolean;
}) {
  const kinds = kindsOf(level, card, live);
  const active = activeIn(level, card, opened, live);
  const running = active.workers;
  const parts = [
    level.workers.length > 0 && {
      key: 'w',
      text:
        running > 0
          ? `${running}/${plural(level.workers.length, 'worker')}`
          : plural(level.workers.length, 'worker'),
      kind: undefined,
      active: running > 0,
    },
    level.messages.length > 0 && {
      key: 'm',
      text: plural(level.messages.length, 'handle'),
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

function StateFields({
  card,
  opened,
  tag,
}: {
  readonly card: Card;
  readonly opened: Data;
  readonly tag: string;
}) {
  const fields = fieldsOf(card.print.states[tag]?.data);
  if (fields.length === 0) return null;
  const state = opened?.state as Readonly<Record<string, unknown>> | undefined;
  const now = state?.['_tag'] === tag ? state : undefined;
  return (
    <section className="flex flex-col gap-1">
      <Label>Holds</Label>
      <ul className="flex flex-col font-mono text-[11px]">
        {fields.map(({ name, shape }) => {
          const value = now?.[name];
          return now && typeof value === 'object' && value !== null ? (
            <li
              key={name}
              className="flex min-w-0 flex-col gap-0.5 px-1 py-0.5"
            >
              <span className="shrink-0">{name}</span>
              <Json value={value} lines={6} />
            </li>
          ) : (
            <li key={name} className="flex min-w-0 gap-2 px-1 py-0.5">
              <span className="shrink-0">{name}</span>
              <span className="truncate text-muted-foreground">
                {now ? brief(value) : textOf(shape)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

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
                'outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
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

function LevelBody({
  level,
  card,
  opened,
  mode,
  focus,
  onChild,
}: {
  readonly level: CardLevel;
  readonly card: Card;
  readonly opened: Data;
  readonly mode: Mode;
  readonly focus: Part | undefined;
  readonly onChild: (slot: string) => void;
}) {
  const live = mode !== 'blueprint';
  return (
    <div className="flex flex-col gap-3 pt-1 pb-3 pl-5">
      {level.key !== '*' && (
        <StateFields card={card} opened={opened} tag={level.key} />
      )}
      {level.workers.length > 0 && (
        <section className="flex flex-col gap-1">
          <Label>Workers</Label>
          <ul className="flex flex-col gap-0.5">
            {level.workers.map((worker) => {
              const keys = keysOf(opened, worker.name);
              const on = live && keys.length > 0;
              return (
                <li key={worker.name}>
                  <Spot
                    wide
                    on={focus?.kind === 'worker' && focus.name === worker.name}
                    className={cn(
                      'flex h-7 items-center gap-2 px-2',
                      on && RUNNING,
                    )}
                  >
                    <span
                      className={cn(
                        'font-mono text-xs',
                        !on && live && 'text-muted-foreground',
                      )}
                    >
                      {worker.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {worker.condition}
                    </span>
                    <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                      {on && keys.some((key) => key !== '')
                        ? keys.map((key) => `#${key}`).join(' ')
                        : ''}
                    </span>
                  </Spot>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {level.messages.length > 0 && (
        <section className="flex flex-col gap-1">
          <Label>Handles</Label>
          <ul className="flex flex-col gap-0.5">
            {level.messages.map((message) => {
              const took = live && card.took?.message === message.tag;
              return (
                <li key={message.tag}>
                  <Spot
                    wide
                    on={
                      focus?.kind === 'message' &&
                      focus.name === message.tag &&
                      (focus.state ?? '*') === level.key
                    }
                    className={cn(
                      'flex h-7 min-w-0 items-center gap-2 px-2',
                      took &&
                        (tookChanged(card)
                          ? TINT.changed
                          : 'relative bg-muted/60 before:absolute before:inset-y-1.5 before:left-0.5 before:w-0.5 before:rounded-full before:bg-muted-foreground/40'),
                    )}
                  >
                    <Carries name={message.tag} payload={message.payload} />
                    {took && (
                      <span
                        className={cn(
                          'ml-auto shrink-0 text-[11px]',
                          tookChanged(card)
                            ? 'font-medium text-changed'
                            : 'text-muted-foreground',
                        )}
                      >
                        {card.took?.outcome !== 'handled'
                          ? 'ignored'
                          : tookChanged(card)
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
      {level.children.length > 0 && (
        <section className="flex flex-col gap-1">
          <Label>Children</Label>
          <div className="flex flex-wrap gap-1">
            {level.children.map((child) => {
              const absent = childOf(card, child.name) === undefined;
              const kind = live ? childKind(card, child.name) : undefined;
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

const firstOpen = (card: Card, mode: Mode, focus: Part | undefined) => {
  const first =
    sectionOfPart(levelsOf(card), focus) ??
    (mode === 'blueprint' ? undefined : (card.state ?? '*'));
  return new Set(first === undefined ? [] : [first]);
};

export interface MoreSection {
  readonly key: string;
  readonly title: string;
  readonly folded: ReactNode;
  readonly body: ReactNode;
}

export function Sections({
  opened,
  more = [],
}: {
  readonly opened?: Data;
  readonly more?: ReadonlyArray<MoreSection>;
}) {
  const { card, mode, focus, uses, onChild, onCapability } = useCard();
  const levels = levelsOf(card);
  const current = card.state;
  const [open, setOpen] = useState<ReadonlySet<string>>(() =>
    firstOpen(card, mode, focus),
  );
  const [shownIn, setShownIn] = useState(mode);
  if (shownIn !== mode) {
    setShownIn(mode);
    setOpen(firstOpen(card, mode, focus));
  }
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
  const { model, props } = card.print;
  const gives = givesOf(card);
  const needs = needsOf(uses);
  const shownServices = servicesOf(uses);
  const states = levels.states;
  const live = mode !== 'blueprint';

  const fold = (
    key: string,
    title: ReactNode,
    folded: ReactNode,
    body: ReactNode,
    options: {
      readonly dim?: boolean;
      readonly kind?: Kind | undefined;
      readonly active?: boolean;
      readonly empty?: boolean;
      readonly kept?: boolean;
    } = {},
  ) => {
    const shown = open.has(key) && !options.empty;
    const tone = options.kind
      ? INK[options.kind]
      : options.active
        ? 'text-running'
        : undefined;
    return (
      <li key={key} className={cn(options.dim && 'opacity-50')}>
        <button
          type="button"
          aria-expanded={options.empty ? undefined : shown}
          disabled={options.empty}
          onClick={() => flip(key)}
          className={cn(
            'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-2 pl-1 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            options.empty ? 'cursor-default' : 'hover:bg-muted/60',
          )}
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none',
              shown && 'rotate-90',
              options.empty && 'invisible',
              tone ?? 'text-muted-foreground',
            )}
          />
          <span className={cn('flex min-w-0 items-center', tone)}>{title}</span>
          <span className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground">
            {folded}
          </span>
        </button>
        {options.kept ? <div hidden={!shown}>{body}</div> : shown && body}
      </li>
    );
  };
  const fields = (value: unknown, shape: Shape | undefined) =>
    plural(
      live && typeof value === 'object' && value !== null
        ? Object.keys(value).length
        : fieldsOf(shape).length,
      'field',
    );
  const value = (
    key: 'model' | 'props',
    title: string,
    shape: Shape | undefined,
    data: unknown,
  ) =>
    (live ? data !== undefined : shape !== undefined) &&
    fold(
      key,
      <span className="shrink-0 text-xs font-medium">{title}</span>,
      fields(data, shape),
      <Spot
        wide
        on={focus?.kind === key}
        className="flex flex-col gap-2 pt-1 pb-3 pl-5"
      >
        <Json value={live ? data : shape ? schemaJson(shape) : undefined} />
      </Spot>,
    );

  return (
    <ul className="flex flex-col gap-0.5">
      {!isEmpty(levels.always, card) &&
        fold(
          '*',
          <span className="shrink-0 text-xs font-medium">Always</span>,
          <Counts
            level={levels.always}
            card={card}
            opened={opened}
            live={live}
          />,
          <LevelBody
            level={levels.always}
            card={card}
            opened={opened}
            mode={mode}
            focus={focus}
            onChild={onChild}
          />,
          {
            kind: kindsOf(levels.always, card, live).all,
            active: activeIn(levels.always, card, opened, live).any,
          },
        )}
      {states.length > 0 && (
        <li className="pt-1.5">
          <p className="px-1 pb-0.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            States
          </p>
          <ul className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-1.5">
            {states.map((level) => {
              const here = level.key === current && live;
              return fold(
                level.key,
                <Spot
                  on={focus?.kind === 'state' && focus.name === level.key}
                  className="flex shrink-0 items-center gap-1.5 font-mono text-xs"
                >
                  <span className={cn(here && 'font-semibold')}>
                    {level.key}
                  </span>
                </Spot>,
                <Counts
                  level={level}
                  card={card}
                  opened={opened}
                  live={here}
                />,
                <LevelBody
                  level={level}
                  card={card}
                  opened={opened}
                  mode={mode}
                  focus={focus}
                  onChild={onChild}
                />,
                {
                  dim: live && level.key !== current,
                  kind: here ? kindsOf(level, card, live).all : undefined,
                  active: here,
                  empty: isEmpty(level, card),
                },
              );
            })}
          </ul>
        </li>
      )}
      {value('model', 'Model', model, opened?.model)}
      {value('props', 'Props', props, opened?.props)}
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
      {more.map((section) =>
        fold(
          `more:${section.key}`,
          <span className="shrink-0 text-xs font-medium">{section.title}</span>,
          section.folded,
          <div className="pt-1 pb-2 pl-5">{section.body}</div>,
          { kept: true },
        ),
      )}
    </ul>
  );
}
