import type { ReactNode } from 'react';
import type { ChangeStatus } from 'laymos';

import {
  Box,
  ChevronRight,
  Folder,
  Lock,
  Package,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';

import type { LaymoNode } from '../laymo-tree';

/** Every card is this wide; a card holding others grows around them. */
export const laymoCardWidth = 200;
/** A card's own height: its name, nothing more. */
export const laymoCardHeight = 36;

/**
 * What a card looks like: a Module that holds nothing, a plain Wrapper that
 * only holds, or a Module that is also the Wrapper of Modules nested in it.
 */
export type CardLook = 'module' | 'wrapper' | 'module-wrapper';

export const lookOf = (card: LaymoNode): CardLook =>
  card.kind === 'wrapper'
    ? 'wrapper'
    : card.children.length > 0
      ? 'module-wrapper'
      : 'module';

export const lookIcons = {
  module: Box,
  wrapper: Folder,
  'module-wrapper': Package,
};

/**
 * A card's outline in each change status, and thicker with a glow when
 * selected. Light mode takes darker shades than dark mode, so the color
 * keeps its contrast against a white card.
 */
const statusOutline: Readonly<
  Record<ChangeStatus, { rest: string; selected: string }>
> = {
  added: {
    rest: 'ring-green-600 border-green-600 dark:ring-green-400 dark:border-green-400',
    selected:
      'ring-2 ring-green-600 border-green-600 dark:ring-green-400 dark:border-green-400 shadow-[0_0_0_5px_rgb(22_163_74/0.14),0_10px_28px_-10px_rgb(0_0_0/0.25)] dark:shadow-[0_0_0_5px_rgb(74_222_128/0.16),0_10px_28px_-10px_rgb(0_0_0/0.45)]',
  },
  modified: {
    rest: 'ring-yellow-700 border-yellow-700 dark:ring-yellow-400 dark:border-yellow-400',
    selected:
      'ring-2 ring-yellow-700 border-yellow-700 dark:ring-yellow-400 dark:border-yellow-400 shadow-[0_0_0_5px_rgb(161_98_7/0.14),0_10px_28px_-10px_rgb(0_0_0/0.25)] dark:shadow-[0_0_0_5px_rgb(250_204_21/0.16),0_10px_28px_-10px_rgb(0_0_0/0.45)]',
  },
  deleted: {
    rest: 'ring-red-600 border-red-600 dark:ring-red-400 dark:border-red-400 opacity-60',
    selected:
      'ring-2 ring-red-600 border-red-600 dark:ring-red-400 dark:border-red-400 shadow-[0_0_0_5px_rgb(220_38_38/0.14),0_10px_28px_-10px_rgb(0_0_0/0.25)] dark:shadow-[0_0_0_5px_rgb(248_113_113/0.16),0_10px_28px_-10px_rgb(0_0_0/0.45)] opacity-70',
  },
};

const plainSelected =
  'ring-2 ring-foreground/80 shadow-[0_0_0_5px_color-mix(in_oklab,var(--foreground)_8%,transparent),0_10px_28px_-10px_rgb(0_0_0/0.45)]';

/**
 * The opaque gray of each nesting level, from the Project down. In dark
 * mode the levels rise toward the light and a closed card sits two steps
 * above its level; in light mode they sink into gray and a closed card is
 * white, so cards always stand clear of the ground they lie on. Steps are
 * wide near the top and narrow as levels deepen. Opaque, so no level's wash
 * stacks on the one beneath it.
 */
const lightLevels = [
  'bg-transparent',
  'bg-[oklch(0.968_0_0)]',
  'bg-[oklch(0.942_0_0)]',
  'bg-[oklch(0.918_0_0)]',
  'bg-[oklch(0.898_0_0)]',
  'bg-[oklch(0.882_0_0)]',
  'bg-[oklch(0.869_0_0)]',
  'bg-[oklch(0.858_0_0)]',
  'bg-[oklch(0.849_0_0)]',
  'bg-[oklch(0.842_0_0)]',
] as const;

const darkLevels = [
  'dark:bg-transparent',
  'dark:bg-[oklch(0.182_0_0)]',
  'dark:bg-[oklch(0.214_0_0)]',
  'dark:bg-[oklch(0.242_0_0)]',
  'dark:bg-[oklch(0.266_0_0)]',
  'dark:bg-[oklch(0.286_0_0)]',
  'dark:bg-[oklch(0.302_0_0)]',
  'dark:bg-[oklch(0.316_0_0)]',
  'dark:bg-[oklch(0.328_0_0)]',
  'dark:bg-[oklch(0.338_0_0)]',
] as const;

const at = <T,>(levels: readonly T[], level: number) =>
  levels[Math.min(Math.max(level, 0), levels.length - 1)]!;

/**
 * The frame of a card at `depth`. An open card is its level's gray; a
 * closed card stands clear of it. Every edge is solid; the icon says what a
 * card is. The outline is gray, or green, yellow or red when the Change set
 * added, modified or deleted it; a deleted card is faded too. Selected, the
 * same outline thickens and glows.
 */
export function lookSurface({
  look,
  open,
  top,
  depth,
  status,
  selected = false,
}: {
  readonly look: CardLook;
  readonly open: boolean;
  readonly top: boolean;
  readonly depth: number;
  readonly status?: ChangeStatus | undefined;
  readonly selected?: boolean;
}): string {
  if (top) return 'bg-transparent ring-border/70 shadow-none';
  // A closed card, Module or Wrapper alike, stands clear of the level it
  // lies on at any depth: white in light mode, two steps up in dark. Its
  // icon says what it is.
  const fill =
    open && look !== 'module'
      ? cn(at(lightLevels, depth), at(darkLevels, depth))
      : cn('bg-[oklch(1_0_0)]', at(darkLevels, depth + 1));
  const closed = !open || look === 'module';
  return cn(
    fill,
    'ring-foreground/[0.18] dark:ring-foreground/[0.12]',
    // A closed card is a piece laid on its level: a faint lift and a lit
    // top edge. An open one is ground, flat.
    selected
      ? undefined
      : closed
        ? 'shadow-[0_1px_2px_rgb(0_0_0/0.1),0_2px_6px_-2px_rgb(0_0_0/0.08)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_1px_3px_rgb(0_0_0/0.4)]'
        : 'shadow-none',
    status !== undefined && statusOutline[status].rest,
    selected &&
      (status === undefined ? plainSelected : statusOutline[status].selected),
  );
}

/** Whether anything outside its Wrapper imports a Module. */
export type Exposure = 'internal' | 'exposed';

/** The name and icon of a card the Change set touched, in its color. */
const statusText: Readonly<Record<ChangeStatus, string>> = {
  added: 'text-green-700 dark:text-green-400',
  modified: 'text-yellow-700 dark:text-yellow-400',
  deleted: 'text-red-700 dark:text-red-400',
};

/**
 * What a card says: its name and what it is. A card that holds others leads
 * with its own button to open and close it in place; pressing the rest of
 * the card only selects it. Inside a Wrapper, a lock marks a card only its
 * neighbours import, and a tag one imported from outside: exposed. A card
 * that fits its name grows past the usual width rather than cut it short.
 */
export function LaymoCard({
  card,
  top,
  open,
  status,
  exposure,
  wrapper,
  name: topName,
  badges,
  fitName = false,
  onToggle,
}: {
  readonly card: LaymoNode;
  readonly top: boolean;
  readonly open: boolean;
  /** The Change set's standing for it: its name and icon take the color. */
  readonly status?: ChangeStatus | undefined;
  readonly exposure?: Exposure | undefined;
  /** The card it sits in, named in the lock's title. */
  readonly wrapper?: string | undefined;
  /** What the top card is called, in place of the Project. */
  readonly name?: string | undefined;
  /** Markers after the name, such as what the card can be opened in. */
  readonly badges?: ReactNode;
  /** Grow to show the whole name; otherwise the name is cut to the width. */
  readonly fitName?: boolean;
  /** Absent for a card that cannot close: it shows no toggle. */
  readonly onToggle?: (() => void) | undefined;
}) {
  const look = lookOf(card);
  const Icon = lookIcons[look];
  const opens = !top && card.children.length > 0 && onToggle !== undefined;
  const name = top
    ? (topName ?? (card.node.path === '.' ? 'Project' : card.node.path))
    : card.title;
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 ps-2 pe-3 text-[13px]',
        top
          ? 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
          : 'font-medium',
      )}
      style={{
        ...(fitName ? { minWidth: laymoCardWidth } : { width: laymoCardWidth }),
        height: laymoCardHeight,
      }}
    >
      {opens ? (
        <button
          type="button"
          data-space-ignore
          aria-label={
            open ? `Close ${card.node.path}` : `Open ${card.node.path}`
          }
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.();
          }}
          className="-my-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 transition-transform duration-200',
              open && 'rotate-90',
            )}
          />
        </button>
      ) : (
        !top && <span aria-hidden className="w-1.5 shrink-0" />
      )}
      {!top && (
        <Icon
          aria-hidden
          className={cn(
            'size-3.5 shrink-0',
            status === undefined ? 'text-muted-foreground' : statusText[status],
          )}
        />
      )}
      <span
        className={cn(
          'min-w-0 flex-1',
          fitName ? 'whitespace-nowrap' : 'truncate',
          !top && status !== undefined && statusText[status],
        )}
      >
        {name}
      </span>
      {badges}
      {exposure !== undefined && (
        <span
          role="img"
          aria-label={
            exposure === 'internal'
              ? `Internal: nothing outside ${wrapper ?? 'its Wrapper'} imports it`
              : `Exposed: imported from outside ${wrapper ?? 'its Wrapper'}`
          }
          className="shrink-0"
        >
          {exposure === 'internal' ? (
            <Lock aria-hidden className="size-3 text-muted-foreground/70" />
          ) : (
            <span className="rounded-[4px] bg-foreground/[0.07] px-1 py-px text-[9.5px] font-medium tracking-wide text-muted-foreground">
              exposed
            </span>
          )}
        </span>
      )}
    </div>
  );
}
