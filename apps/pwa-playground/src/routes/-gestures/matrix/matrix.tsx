import {
  GestureZone,
  useHold,
} from '@kstackz/ui-toolkit/components/blocks/gestures';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import {
  motion,
  type MotionValue,
  useReducedMotion,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useState } from 'react';
import {
  type Hold,
  usePanCell,
  usePinchCell,
  useSwipeCell,
  useTapCell,
} from './gestures.tsx';

export { matrixTutorial } from './tutorial.tsx';

type Mode = 'pan' | 'swipe';

const HOLDS: ReadonlyArray<Hold> = ['none', 'left', 'right'];
const HOLD_LABEL: Record<Hold, string> = {
  none: 'No Hold',
  left: 'Left Hold',
  right: 'Right Hold',
};

type CellProps = {
  readonly hold: Hold;
  readonly onStart: () => void;
  readonly onHit: (detail: string) => void;
  readonly onCancel: () => void;
};

/**
 * One row of the matrix: its label, and the component that registers its
 * gesture in a cell and shows its live value (a tap has none, so the cell
 * shows where it landed).
 */
type Row = {
  readonly id: string;
  readonly label: string;
  readonly live: boolean;
  readonly Gesture: (props: CellProps) => ReactNode;
};

function Live(props: { readonly value: MotionValue<string> }) {
  return <motion.span>{props.value}</motion.span>;
}

const tapRow = (id: string, label: string, fingers: 1 | 2): Row => ({
  id,
  label,
  live: false,
  Gesture: function TapGesture(props: CellProps) {
    useTapCell({ ...props, fingers });
    return null;
  },
});

const moveRow = (id: string, fingers: 1 | 2, mode: Mode): Row => ({
  id,
  label:
    fingers === 2
      ? `2-finger ${mode === 'pan' ? 'pan' : 'swipe'}`
      : mode === 'pan'
        ? 'Pan'
        : 'Swipe',
  live: true,
  Gesture:
    mode === 'pan'
      ? function PanGesture(props: CellProps) {
          return <Live value={usePanCell({ ...props, fingers })} />;
        }
      : function SwipeGesture(props: CellProps) {
          return <Live value={useSwipeCell({ ...props, fingers })} />;
        },
});

const rowsFor = (mode: Mode): ReadonlyArray<Row> => [
  tapRow('tap', 'Tap', 1),
  moveRow('move', 1, mode),
  tapRow('tap-2', '2-finger tap', 2),
  moveRow('move-2', 2, mode),
  {
    id: 'pinch',
    label: 'Pinch',
    live: true,
    Gesture: function PinchGesture(props: CellProps) {
      return <Live value={usePinchCell(props)} />;
    },
  },
];

// Made once per mode, so each cell's hooks keep their component across renders.
const ROWS: Record<Mode, ReadonlyArray<Row>> = {
  pan: rowsFor('pan'),
  swipe: rowsFor('swipe'),
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const LIFT = { type: 'spring', duration: 0.25, bounce: 0 } as const;

/**
 * One cell: its gesture's hook and a count. While the gesture runs the cell
 * lifts, ringed and tinted; when it is recognised a copy of the ring grows
 * and fades from the cell and the count bumps. A cancelled Swipe only fades.
 */
function Cell(props: {
  readonly row: Row;
  readonly hold: Hold;
  readonly onActive: (active: boolean) => void;
}) {
  const [hits, setHits] = useState({ count: 0, detail: '' });
  const [active, setActive] = useState(false);
  const [popping, setPopping] = useState(false);
  const still = useReducedMotion() === true;
  const settle = (active: boolean) => {
    setActive(active);
    props.onActive(active);
  };
  const onHit = (detail: string) => {
    setHits((last) => ({ count: last.count + 1, detail }));
    setPopping(true);
    settle(false);
  };
  const { Gesture } = props.row;
  return (
    <motion.div
      role="cell"
      data-testid={`matrix-cell-${props.row.id}-${props.hold}`}
      data-count={hits.count}
      data-detail={hits.detail}
      data-active={active ? '' : undefined}
      animate={{ scale: active && !still ? 1.03 : 1 }}
      transition={LIFT}
      className={cn(
        'relative flex min-w-0 flex-col items-center justify-center rounded-lg bg-muted px-1 py-1 transition-[background-color,box-shadow] duration-150 ease-out data-active:bg-chart-8/15 data-active:ring-2 data-active:ring-chart-8',
        (active || popping) && 'z-10',
      )}
    >
      {hits.count > 0 ? (
        <motion.span
          key={hits.count}
          aria-hidden="true"
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: still ? 1 : 1.3 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          onAnimationComplete={() => setPopping(false)}
          className="pointer-events-none absolute inset-0 rounded-lg bg-chart-8/20 ring-2 ring-chart-8"
        />
      ) : null}
      <motion.span
        key={hits.count}
        initial={{ scale: hits.count > 0 && !still ? 1.15 : 1 }}
        animate={{ scale: 1 }}
        transition={LIFT}
        className="relative text-lg leading-none font-semibold tabular-nums"
      >
        {hits.count}
      </motion.span>
      <span className="relative mt-1 h-3.5 max-w-full truncate font-mono text-[10px] leading-3.5 text-muted-foreground tabular-nums">
        <Gesture
          hold={props.hold}
          onStart={() => settle(true)}
          onHit={onHit}
          onCancel={() => settle(false)}
        />
        {props.row.live ? null : hits.detail}
      </span>
    </motion.div>
  );
}

/** A column's heading, lit while its Hold is down. */
function HoldHeader(props: { readonly hold: Hold }) {
  const held = useHold();
  const lit =
    props.hold === 'none' ? held === undefined : held?.side === props.hold;
  return (
    <div
      role="columnheader"
      data-active={lit ? '' : undefined}
      className="rounded-md py-1 text-center text-[11px] font-medium text-muted-foreground transition-colors data-active:bg-chart-8/20 data-active:text-foreground"
    >
      {HOLD_LABEL[props.hold]}
    </div>
  );
}

function Matrix(props: { readonly mode: Mode }) {
  // Rows with a gesture under way, so their label lights with the cell.
  const [activeRows, setActiveRows] = useState<ReadonlySet<string>>(new Set());
  const onActive = (id: string) => (active: boolean) =>
    setActiveRows((rows) => {
      if (rows.has(id) === active) return rows;
      const next = new Set(rows);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <div
      role="table"
      aria-label="Gestures by Hold"
      className="grid min-h-0 flex-1 grid-cols-[5.25rem_repeat(3,minmax(0,1fr))] grid-rows-[auto_repeat(7,minmax(0,1fr))] gap-1.5"
    >
      <div role="row" className="contents">
        <div role="columnheader" />
        {HOLDS.map((hold) => (
          <HoldHeader key={hold} hold={hold} />
        ))}
      </div>
      {ROWS[props.mode].map((row) => (
        <div key={row.id} role="row" className="contents">
          <div
            role="rowheader"
            data-active={activeRows.has(row.id) ? '' : undefined}
            className="flex items-center rounded-md px-1 text-xs leading-tight font-medium transition-colors data-active:bg-chart-8/20"
          >
            {row.label}
          </div>
          {HOLDS.map((hold) => (
            <Cell
              key={hold}
              row={row}
              hold={hold}
              onActive={onActive(row.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The Matrix: every gesture the engine reads, by Hold, each counted as it is
 * recognised, in a zone of its own. The switch flips the movement rows
 * between Pan and Swipe; Reset counts remounts the table.
 */
export function MatrixScreen() {
  const [mode, setMode] = useState<Mode>('pan');
  const [round, setRound] = useState(0);
  return (
    <GestureZone
      scroll="none"
      data-testid="matrix-zone"
      data-mode={mode}
      className="flex h-full flex-col gap-2 pt-2 pr-[max(0.75rem,env(safe-area-inset-right))] pb-2 pl-[max(0.75rem,env(safe-area-inset-left))]"
    >
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              mode === 'pan' ? 'font-medium' : 'text-muted-foreground',
            )}
          >
            Pan
          </span>
          <Switch
            data-testid="matrix-mode"
            checked={mode === 'swipe'}
            onCheckedChange={(swipe) => setMode(swipe ? 'swipe' : 'pan')}
            aria-label="Swipe mode"
          />
          <span
            className={cn(
              mode === 'swipe' ? 'font-medium' : 'text-muted-foreground',
            )}
          >
            Swipe
          </span>
        </label>
        <Button
          variant="outline"
          size="sm"
          data-testid="matrix-reset"
          onClick={() => setRound((n) => n + 1)}
        >
          Reset counts
        </Button>
      </div>
      <Matrix key={`${mode}-${round}`} mode={mode} />
    </GestureZone>
  );
}
