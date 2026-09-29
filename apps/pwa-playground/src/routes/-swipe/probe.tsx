import {
  type CommitRule,
  type Direction,
  type SwipeCancel,
  type SwipeOptions,
  type SwipeRelease,
  type SwipeState,
  useSwipe,
} from '@kstackz/use-gesture/recognizers';
import {
  type MotionValue,
  motion,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  LaneContext,
  type Part,
  useLabStore,
  ZONE_COLORS,
} from '../-gestures/index.ts';

export const ARROWS: Record<Direction, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

/** A Swipe as a Case sets it up; the probe adds the callbacks. */
export type ProbeOptions = Omit<
  SwipeOptions,
  'onStart' | 'onCommit' | 'onCancel'
>;

const DEFAULT_RULE: CommitRule = { distance: 80, velocity: 500 };

const fingersText = (fingers: ProbeOptions['fingers'] = 1) =>
  typeof fingers === 'number'
    ? `${fingers} finger${fingers === 1 ? '' : 's'}`
    : `${fingers[0]}–${fingers[1]} fingers`;

const ruleText = (rule: CommitRule) => {
  const parts = [
    rule.distance === undefined ? undefined : `offset ≥ ${rule.distance}px`,
    rule.velocity === undefined ? undefined : `speed ≥ ${rule.velocity}px/s`,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? 'nothing: it never Commits' : parts.join(' or ');
};

/** The options as code, the way an app would write them. */
const codeOf = (options: ProbeOptions) => {
  const parts = [`direction: '${options.direction}'`];
  if (options.fingers !== undefined) {
    parts.push(
      `fingers: ${typeof options.fingers === 'number' ? options.fingers : `[${options.fingers.join(', ')}]`}`,
    );
  }
  if (options.from !== undefined) {
    parts.push(
      `from: { edge: '${options.from.edge}', within: ${options.from.within} }`,
    );
  }
  if (options.commit !== undefined) {
    const rule = Object.entries(options.commit)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    parts.push(`commit: { ${rule} }`);
  }
  if (options.enabled === false) parts.push('enabled: false');
  return `useSwipe({ ${parts.join(', ')} })`;
};

const WHY: Record<SwipeCancel, string> = {
  direction:
    'it first moved along the other axis, or the opposite way, so its axis never locked.',
  fingers:
    'the wrong number of fingers were down as its axis locked, or a finger landed after.',
  short: 'it was released without meeting its rule.',
  interrupted:
    'the browser took the touch (a scroller kept it, or the page lost focus).',
};

type Outcome =
  | { readonly kind: 'commit'; readonly release: SwipeRelease }
  | {
      readonly kind: 'cancel';
      readonly reason: SwipeCancel;
      readonly release?: SwipeRelease;
    };

const px = (value: number) => `${Math.round(value)}`;

function Value(props: {
  readonly value: MotionValue<number>;
  readonly unit: string;
}) {
  const text = useTransform(props.value, (v) => `${px(v)}${props.unit}`);
  return (
    <motion.span className="w-[8ch] shrink-0 text-right tabular-nums">
      {text}
    </motion.span>
  );
}

/**
 * A bar from 0 to `max`, filled to `value`, with a tick where the rule
 * starts to hold. It never changes size: the fill scales.
 */
function Meter(props: {
  readonly label: string;
  readonly value: MotionValue<number>;
  readonly max: number;
  readonly mark: number | undefined;
  readonly unit: string;
  readonly on: boolean;
}) {
  const scaleX = useTransform(props.value, (v) =>
    Math.min(Math.max(v / props.max, 0), 1),
  );
  return (
    <div className="flex items-center gap-2">
      <span className="w-[6ch] shrink-0 text-muted-foreground">
        {props.label}
      </span>
      <div className="relative h-2 min-w-0 flex-1 rounded-full bg-muted">
        <motion.div
          style={{ scaleX }}
          className={cn(
            'absolute inset-0 origin-left rounded-full',
            props.on ? 'bg-positive' : 'bg-foreground/60',
          )}
        />
        {props.mark === undefined ? null : (
          <span
            style={{ left: `${(props.mark / props.max) * 100}%` }}
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded bg-foreground"
          />
        )}
      </div>
      <Value value={props.value} unit={props.unit} />
    </div>
  );
}

const STATES: ReadonlyArray<SwipeState> = ['idle', 'possible', 'tracking'];

function OutcomeLine(props: { readonly outcome: Outcome | undefined }) {
  const { outcome } = props;
  if (outcome === undefined) {
    return <span className="text-muted-foreground">No Swipe yet.</span>;
  }
  const numbers =
    outcome.release === undefined
      ? ''
      : ` · offset ${px(outcome.release.offset)} · ${px(outcome.release.velocity)}px/s · projected ${px(outcome.release.projected)}`;
  return outcome.kind === 'commit' ? (
    <span>
      <b className="text-positive">✓ Commit</b>
      {numbers}
    </span>
  ) : (
    <span>
      <b className="text-destructive">✕ Cancel: {outcome.reason}</b>
      {numbers}
    </span>
  );
}

/**
 * One useSwipe, shown as it runs: its options as code, its state, how far
 * and how fast it has gone against its rule, whether letting go now would
 * Commit, and how the last one ended. Every event goes to the log.
 */
export function SwipeProbe(props: {
  /** The number of the Lab zone it sits in, for its color in the log. */
  readonly zone: number;
  readonly name: string;
  readonly options: ProbeOptions;
  /** Leaves out the code and the arrow for small zones, showing `caption` instead. */
  readonly compact?: boolean;
  readonly caption?: string;
  readonly className?: string;
}) {
  const { options } = props;
  const store = useLabStore();
  const lane = useContext(LaneContext);
  const color =
    ZONE_COLORS[(props.zone - 1) % ZONE_COLORS.length] ?? 'currentColor';
  const arrow = ARROWS[options.direction];
  const rule = options.commit ?? DEFAULT_RULE;
  const [outcome, setOutcome] = useState<Outcome>();
  const note = (...parts: ReadonlyArray<Part>) =>
    store.note(lane, [
      { zone: { label: `${lane}Z${props.zone}`, name: props.name, color } },
      ` ${arrow} `,
      ...parts,
    ]);

  const swipe = useSwipe({
    ...options,
    onStart: () =>
      note(
        `Tracking: it moved 10px ${options.direction} with ${fingersText(options.fingers)}, so its axis locked.`,
      ),
    onCommit: (release) => {
      setOutcome({ kind: 'commit', release });
      note(
        `Commit at the first lift: offset ${px(release.offset)}px, ${px(release.velocity)}px/s met ${ruleText(rule)}.`,
      );
    },
    onCancel: (reason, release) => {
      setOutcome({ kind: 'cancel', reason, release });
      note(
        `Cancel (${reason}): ${WHY[reason]}`,
        release === undefined
          ? ''
          : ` It had offset ${px(release.offset)}px at ${px(release.velocity)}px/s; it needed ${ruleText(rule)}.`,
      );
    },
  });

  const [willCommit, setWillCommit] = useState(false);
  useMotionValueEvent(swipe.willCommit, 'change', setWillCommit);

  // Logs the moment it becomes Possible; there is no callback for that.
  const was = useRef(swipe.state);
  useEffect(() => {
    if (swipe.state === 'possible' && was.current !== 'possible') {
      note('Possible: a finger landed where it listens. It locks after 10px.');
    }
    was.current = swipe.state;
  });

  const shift = useTransform(swipe.offset, (v) => Math.min(v, 60));
  const glyph = {
    x: useTransform(shift, (v) =>
      options.direction === 'left' ? -v : options.direction === 'right' ? v : 0,
    ),
    y: useTransform(shift, (v) =>
      options.direction === 'up' ? -v : options.direction === 'down' ? v : 0,
    ),
  };
  const tracking = swipe.state === 'tracking';
  const compact = props.compact === true;

  return (
    <>
      {compact ? null : (
        <div
          aria-hidden="true"
          className="pointer-events-none flex min-h-0 flex-1 items-center justify-center"
        >
          <motion.div
            style={glyph}
            className={cn(
              'flex flex-col items-center font-mono leading-none transition-colors duration-150',
              tracking
                ? willCommit
                  ? 'text-positive'
                  : 'text-foreground'
                : 'text-muted-foreground/40',
            )}
          >
            <span className="text-5xl">{arrow}</span>
            <span className="text-sm">
              ×{fingersText(options.fingers).split(' ')[0]}
            </span>
          </motion.div>
        </div>
      )}
      <div
        className={cn(
          'relative flex flex-col gap-1.5 rounded-lg bg-background/85 p-2 font-mono text-[11px] leading-4 shadow-sm ring-1 ring-foreground/10',
          props.className,
        )}
      >
        {compact ? (
          <p className="truncate text-foreground">{props.caption}</p>
        ) : (
          <code className="line-clamp-2 h-8 text-foreground">
            {codeOf(options)}
          </code>
        )}
        <div className="flex items-center gap-1">
          {compact ? (
            <span className="w-[10ch] rounded bg-foreground px-1.5 py-px text-center text-background">
              {swipe.state}
            </span>
          ) : (
            STATES.map((state) => (
              <span
                key={state}
                className={cn(
                  'rounded px-1.5 py-px',
                  swipe.state === state
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground ring-1 ring-foreground/10',
                )}
              >
                {state}
              </span>
            ))
          )}
          <span
            className={cn(
              'ml-auto shrink-0 rounded px-1.5 py-px text-center',
              compact ? 'w-[10ch]' : 'w-[16ch]',
              !tracking && 'text-muted-foreground ring-1 ring-foreground/10',
              tracking && willCommit && 'bg-positive/15 text-positive',
              tracking && !willCommit && 'bg-destructive/10 text-destructive',
            )}
          >
            {compact ? '' : 'lift '}
            {tracking ? (willCommit ? '→ Commit' : '→ Cancel') : '→ —'}
          </span>
        </div>
        <Meter
          label="offset"
          value={swipe.offset}
          max={(rule.distance ?? 160) * 1.5}
          mark={rule.distance}
          unit="px"
          on={tracking && willCommit}
        />
        <Meter
          label="speed"
          value={swipe.velocity}
          max={(rule.velocity ?? 1000) * 1.5}
          mark={rule.velocity}
          unit="px/s"
          on={tracking && willCommit}
        />
        <p className="truncate">
          <OutcomeLine outcome={outcome} />
        </p>
      </div>
    </>
  );
}
