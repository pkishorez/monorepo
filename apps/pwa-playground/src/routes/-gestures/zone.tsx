import {
  type GestureEnd,
  GestureProvider,
  GestureZone,
  type Pointers,
  useGesture,
} from '@kstackz/use-gesture';
import { LockIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type CSSProperties, type ReactNode, useContext } from 'react';
import { LaneContext, useLab, useLabStore, type ZoneTag } from './store.ts';

/** Each zone's color, by its number: Z1 is always sky, Z2 amber, and so on. */
export const ZONE_COLORS = [
  'oklch(0.68 0.15 235)',
  'oklch(0.74 0.15 70)',
  'oklch(0.64 0.19 300)',
  'oklch(0.68 0.15 155)',
  'oklch(0.66 0.19 15)',
] as const;

export const tint = (color: string, percent: number) =>
  `color-mix(in oklch, ${color} ${percent}%, transparent)`;

/** A Gesture Provider the Lab can tell apart from others: 'A', 'B'. */
export function LabProvider(props: {
  readonly lane: string;
  readonly children: ReactNode;
}) {
  return (
    <GestureProvider>
      <LaneContext value={props.lane}>{props.children}</LaneContext>
    </GestureProvider>
  );
}

// The zone's own useGesture, reporting what it hears to the Lab.
function Ear(props: {
  readonly tag: ZoneTag;
  readonly enabled: boolean;
  readonly onEnd?: (pointers: Pointers, end: GestureEnd) => void;
}) {
  const store = useLabStore();
  const lane = useContext(LaneContext);
  useGesture({
    enabled: props.enabled,
    onStart: (pointers) => store.start(lane, props.tag, pointers),
    onPointer: (pointer, pointers) => store.pointer(lane, pointer, pointers),
    onEnd: (pointers, end) => {
      props.onEnd?.(pointers, end);
      store.end(lane, pointers, end);
    },
  });
  return null;
}

/**
 * A Gesture Zone as the Lab draws it: numbered, in its own color, with a
 * chip saying whether its hook is hearing the Gesture under way (solid and
 * tinted), heard the last one (solid), or not (dashed).
 */
export function LabZone(props: {
  /** 1-based; picks the label `Z<n>` and, unless `tone` is set, the color. */
  readonly n: number;
  readonly name: string;
  /** The color's number, when it should differ from `n`. */
  readonly tone?: number;
  readonly trapped?: boolean;
  /** Whether its useGesture is enabled. */
  readonly hook?: boolean;
  readonly onEnd?: (pointers: Pointers, end: GestureEnd) => void;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  const { hook = true, trapped = false } = props;
  const lane = useContext(LaneContext);
  const run = useLab().runs.get(lane);
  const label = `${lane}Z${props.n}`;
  const color =
    ZONE_COLORS[((props.tone ?? props.n) - 1) % ZONE_COLORS.length] ?? 'gray';
  const tag = { label, name: props.name, color };
  const heard = run?.heard.includes(label) === true;
  const hearing = heard && run?.state === 'active';
  const status = hearing ? 'hearing' : heard ? 'heard last' : undefined;

  return (
    <GestureZone
      trapped={trapped}
      data-lab-zone={label}
      data-lab-name={props.name}
      data-lab-color={color}
      data-hearing={hearing}
      style={
        {
          '--zone': color,
          backgroundColor: hearing ? tint(color, 16) : tint(color, 4),
        } as CSSProperties
      }
      className={cn(
        'relative min-h-0 rounded-xl border-2 border-(--zone) p-2 pt-9 transition-[background-color,border-style] duration-150',
        !heard && 'border-dashed',
        props.className,
      )}
    >
      <Ear tag={tag} enabled={hook} onEnd={props.onEnd} />
      <div className="pointer-events-none absolute top-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1 truncate rounded-md bg-(--zone) px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
        <span>
          {label} · {props.name}
        </span>
        <span
          className={cn(
            'box-content w-[10ch] shrink-0 rounded bg-white/25 px-1 text-center',
            status === undefined && 'invisible',
          )}
        >
          {status ?? 'idle'}
        </span>
        {/* What can change as you flip a switch goes last, so nothing moves. */}
        {trapped ? <LockIcon aria-label="trapped" className="size-3" /> : null}
        {hook ? null : <span className="opacity-80">hook off</span>}
      </div>
      {props.children}
    </GestureZone>
  );
}

/** A patch of the stage outside every zone: the page's own. */
export function NoZone(props: {
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative rounded-xl border-2 border-dashed border-muted-foreground/30 p-2 pt-9',
        props.className,
      )}
    >
      <span className="pointer-events-none absolute top-1.5 left-1.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        no zone · the page’s own
      </span>
      {props.children}
    </div>
  );
}
