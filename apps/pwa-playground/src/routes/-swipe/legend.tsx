import { cn } from '@kstackz/ui-toolkit/utils';
import type { ReactNode } from 'react';
import { FingerChip, ZONE_COLORS, ZoneChip } from '../-gestures/index.ts';

const Mark = (props: {
  readonly children: ReactNode;
  readonly className?: string;
}) => (
  <span
    className={cn(
      'inline-flex h-5 items-center rounded px-1.5 font-mono text-[11px]',
      props.className,
    )}
  >
    {props.children}
  </span>
);

/** How to read a Swipe probe, once, in words. */
export function SwipeLegend() {
  const [sky, amber] = ZONE_COLORS;
  return (
    <dl className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2 [&_dd]:text-muted-foreground [&_dt]:flex [&_dt]:flex-wrap [&_dt]:items-center [&_dt]:gap-1.5">
      <div>
        <dt>
          <Mark className="text-muted-foreground ring-1 ring-edge">idle</Mark>
          <Mark className="bg-foreground text-background">possible</Mark>
          <Mark className="text-muted-foreground ring-1 ring-edge">
            tracking
          </Mark>
        </dt>
        <dd>
          The Swipe’s state, filled. Possible from the first finger landing
          where it listens; tracking once 10px locked its axis.
        </dd>
      </div>
      <div>
        <dt>
          <Mark className="bg-positive/15 text-positive">lift → Commit</Mark>
          <Mark className="bg-destructive/10 text-destructive">
            lift → Cancel
          </Mark>
        </dt>
        <dd>
          What lifting a finger right now would do: <code>willCommit</code>. The
          big arrow turns green with it.
        </dd>
      </div>
      <div>
        <dt className="font-mono text-xs">offset ▬▬|▭▭ · speed ▬|▭▭▭</dt>
        <dd>
          How far and how fast, toward the Swipe’s direction. The tick is the
          rule: past either tick at the lift is a Commit. No tick, no rule for
          that bar.
        </dd>
      </div>
      <div>
        <dt className="font-mono text-xs">
          <b className="text-positive">✓ Commit</b> ·{' '}
          <b className="text-destructive">✕ Cancel: reason</b>
        </dt>
        <dd>
          How the last Swipe ended, with its offset, speed and projected: where
          its momentum would carry it.
        </dd>
      </div>
      <div>
        <dt>
          <ZoneChip label="Z1" name="name" color={sky ?? 'gray'} />
          <FingerChip name="1" color={amber} />
        </dt>
        <dd>
          Zones and fingers as in the Gesture Lab: every finger is drawn with
          the line it has travelled.
        </dd>
      </div>
      <div>
        <dt className="font-mono text-xs">useSwipe({'{ … }'})</dt>
        <dd>The Swipe’s options, as an app would write them.</dd>
      </div>
    </dl>
  );
}
