import type { ReactNode } from 'react';
import { Box, Boxes, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '../../../../../ui/components/kit/class-names.ts';
import { ink } from '../../ink/index.ts';
import { CARD } from '../../scene/index.ts';
import type {
  Placed,
  StateOption,
  WorkerKey,
  WorkerRow,
} from '../../scene/index.ts';

/*
 * A Node: one card per place an Actor runs, at the size its Actor gives it,
 * so nothing on it ever moves or grows.
 *
 * 1. Header   the Actor's name; a place of keyed Children is a stack of two
 *             cards, and shows one Instance at a time: a switcher in its
 *             corner steps through them.
 * 2. States   one option per State, like a radio: the one its Instance is in
 *             is filled. A place of many fills the shown Instance's, and
 *             counts how many of all its Instances are in each.
 * 3. Workers  one row per Worker the Actor has, always there: one dot per key
 *             it runs now, a dot that breathes while it works, red where it
 *             failed, quiet where it finished. Away from the live app, a dot
 *             says only that it is on. A Worker with no key running reads off.
 *
 * A card where something runs stands up off the Map; one where nothing
 * does lies flat, dashed. The card the Step's Message went to wears its
 * colour, and the Worker that Sent it has its row lit. Only colours and
 * shadows change, and they fade. A right click folds what hangs below it.
 * A click anywhere on the card picks it; on a State, a Worker or the
 * switcher, picks that instead.
 */

/** What part of a Node is picked. */
export type Part =
  | { readonly state: string }
  | { readonly worker: string }
  | undefined;

/** The most dots a Worker's row shows; more are counted. */
const DOTS = 6;

const FADE =
  'transition-[color,background-color,border-color,box-shadow] duration-200';

const RAISED =
  '0 1px 2px rgb(0 0 0 / 0.06), 0 4px 10px rgb(0 0 0 / 0.07), 0 12px 28px -8px rgb(0 0 0 / 0.12)';
const GOT = `0 0 0 4px ${ink('message-soft')}, 0 10px 32px -6px color-mix(in oklch, ${ink('message')} 45%, transparent)`;

const dotTone = (key: WorkerKey) =>
  key.status === 'running'
    ? ink('running')
    : key.status === 'failed'
      ? ink('failed')
      : key.status === 'finished'
        ? 'var(--muted-foreground)'
        : ink('lit');

export function Node({
  node,
  picked,
  part,
  sentBy,
  got = false,
  onPick,
  onChoose,
}: {
  readonly node: Placed;
  /** The card is picked. */
  readonly picked: boolean;
  /** The part of it picked, if one is. */
  readonly part: Part;
  /** The Worker that Sent the Step's Message, if it is this Node's. */
  readonly sentBy: string | undefined;
  /** The Step's Message went to this card. */
  readonly got?: boolean;
  readonly onPick: (part: Part | null) => void;
  /** Show another of a place of many's Instances. */
  readonly onChoose?: (instance: string) => void;
}) {
  const { lit, many } = node;
  const card = cn(
    'absolute inset-0 rounded-xl border',
    FADE,
    lit ? 'bg-card' : 'bg-background/60 border-dashed',
  );
  const edge = got
    ? ink('message')
    : picked
      ? ink('lit')
      : lit
        ? ink('line-lit')
        : ink('dim');
  const total = node.instances.length;
  const at = node.chosen ? node.instances.indexOf(node.chosen) : -1;
  const step = (by: number) =>
    onChoose?.(node.instances[(at + by + total) % total]!.id);

  return (
    <div
      className="absolute top-0 left-0 cursor-default"
      style={{ width: node.width, height: node.height }}
      onClick={() => onPick(picked && !part ? null : undefined)}
    >
      {many && (
        <span
          aria-hidden
          className={cn(card, 'translate-x-[5px] translate-y-[5px]')}
          style={{
            borderColor: lit ? ink('line-lit') : ink('dim'),
            boxShadow: lit ? RAISED : undefined,
          }}
        />
      )}
      <span
        aria-hidden
        className={card}
        style={{
          borderColor: edge,
          borderWidth: got ? 1.5 : undefined,
          boxShadow: got
            ? `${GOT}, ${RAISED}`
            : lit && !many
              ? RAISED
              : undefined,
        }}
      />
      <div
        className="relative flex h-full flex-col"
        style={{ padding: CARD.pad }}
      >
        {/* 1. Header */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-pressed={picked && !part}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2',
              FADE,
            )}
            style={{
              height: CARD.header,
              color: lit ? ink('lit') : ink('dim'),
            }}
          >
            {many ? (
              <Boxes className="size-3.5 shrink-0 opacity-70" />
            ) : (
              <Box className="size-3.5 shrink-0 opacity-70" />
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
              {node.name}
            </span>
            {many && total === 0 && (
              <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                ×0
              </span>
            )}
          </button>
          {many && total > 0 && (
            <Switcher
              label={node.chosen?.key ?? ''}
              at={at}
              total={total}
              onStep={step}
            />
          )}
        </div>

        {/* 2. States */}
        {node.states && (
          <div className="flex flex-col" style={{ marginTop: CARD.gap }}>
            {node.states.map((line, index) => (
              <div
                key={index}
                className="flex items-center gap-3"
                style={{ height: CARD.line }}
              >
                {line.map((option) => (
                  <Option
                    key={option.tag}
                    option={option}
                    lit={lit}
                    many={many}
                    active={
                      many
                        ? node.chosen?.state._tag === option.tag
                        : option.count > 0
                    }
                    picked={
                      part !== undefined &&
                      'state' in part &&
                      part.state === option.tag
                    }
                    onPick={() => onPick({ state: option.tag })}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 3. Workers */}
        {node.workers.length > 0 && (
          <div className="flex flex-col" style={{ marginTop: CARD.gap }}>
            {node.workers.map((row) => (
              <Row
                key={row.name}
                row={row}
                sent={sentBy === row.name}
                picked={
                  part !== undefined &&
                  'worker' in part &&
                  part.worker === row.name
                }
                onPick={() => onPick({ worker: row.name })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Option({
  option,
  lit,
  many,
  active,
  picked,
  onPick,
}: {
  readonly option: StateOption;
  readonly lit: boolean;
  readonly many: boolean;
  /** The shown Instance is in it. */
  readonly active: boolean;
  readonly picked: boolean;
  readonly onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}
      aria-pressed={picked}
      aria-label={`State ${option.tag}${many ? `, ${option.count} in it` : active ? ', active' : ''}`}
      className={cn(
        'flex items-center gap-1.5 rounded-sm text-[11.5px] whitespace-nowrap outline-none focus-visible:ring-2',
        FADE,
        picked && 'underline decoration-2 underline-offset-4',
      )}
      style={{
        color: active
          ? ink('lit')
          : lit
            ? 'var(--muted-foreground)'
            : ink('dim'),
        textDecorationColor: ink('message'),
      }}
    >
      <span
        className={cn(
          'grid size-2.5 shrink-0 place-items-center rounded-full border-[1.5px]',
          FADE,
        )}
        style={{
          borderColor: active
            ? ink('active')
            : lit
              ? ink('line-lit')
              : ink('dim'),
        }}
      >
        <span
          className="size-1 rounded-full transition-[opacity,scale] duration-200"
          style={{
            backgroundColor: ink('active'),
            opacity: active ? 1 : 0,
            scale: active ? 1 : 0.4,
          }}
        />
      </span>
      {option.tag}
      {many && (
        <span className="text-muted-foreground tabular-nums">
          {option.count}
        </span>
      )}
    </button>
  );
}

/** Which of a place of many's Instances shows, and a step to the one before or after. */
function Switcher({
  label,
  at,
  total,
  onStep,
}: {
  /** The shown Instance's key. */
  readonly label: string;
  readonly at: number;
  readonly total: number;
  readonly onStep: (by: number) => void;
}) {
  const arrow =
    'text-muted-foreground hover:text-foreground hover:bg-muted grid size-5 shrink-0 place-items-center rounded transition-colors duration-150 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-30';
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        className={arrow}
        onClick={(event) => {
          event.stopPropagation();
          onStep(-1);
        }}
        disabled={total < 2}
        aria-label="The Instance before"
      >
        <ChevronLeft className="size-3" />
      </button>
      <span
        className="flex max-w-24 min-w-0 items-baseline gap-1 text-[11px]"
        aria-live="polite"
      >
        <span className="truncate font-mono" title={label}>
          {label}
        </span>
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {at + 1}/{total}
        </span>
      </span>
      <button
        type="button"
        className={arrow}
        onClick={(event) => {
          event.stopPropagation();
          onStep(1);
        }}
        disabled={total < 2}
        aria-label="The Instance after"
      >
        <ChevronRight className="size-3" />
      </button>
    </span>
  );
}

function Row({
  row,
  sent,
  picked,
  onPick,
}: {
  readonly row: WorkerRow;
  readonly sent: boolean;
  readonly picked: boolean;
  readonly onPick: () => void;
}) {
  const on = row.keys.length > 0;
  const shown = row.keys.slice(0, DOTS);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}
      aria-pressed={picked}
      aria-label={`Worker ${row.name}, ${on ? `${row.keys.length} running` : 'off'}`}
      className={cn(
        '-mx-1.5 flex items-center gap-2 rounded-md px-1.5 text-left outline-none focus-visible:ring-2',
        FADE,
        picked && 'bg-muted',
      )}
      style={{
        height: CARD.row,
        backgroundColor: sent ? ink('message-soft') : undefined,
        color: on ? ink('lit') : ink('dim'),
      }}
    >
      <RefreshCw
        className="size-3 shrink-0"
        style={{ color: sent ? ink('message') : undefined, opacity: 0.7 }}
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
        {row.name}
        {row.state && (
          <span className="text-muted-foreground font-sans">
            {' '}
            · in {row.state}
          </span>
        )}
      </span>
      {on ? (
        <span className="flex items-center gap-1">
          {shown.map((key) => (
            <Dot
              key={key.id}
              tone={dotTone(key)}
              breathes={key.status === 'running'}
            />
          ))}
          <span className="text-muted-foreground ml-0.5 font-mono text-[10.5px] tabular-nums">
            {row.keys.length}
          </span>
        </span>
      ) : (
        <span className="text-[10.5px]">off</span>
      )}
    </button>
  );
}

function Dot({
  tone,
  breathes,
}: {
  readonly tone: string;
  readonly breathes: boolean;
}): ReactNode {
  return (
    <span
      className={cn(
        'size-1.5 rounded-full',
        breathes && 'motion-safe:animate-pulse',
      )}
      style={{ backgroundColor: tone }}
    />
  );
}
