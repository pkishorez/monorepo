import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import {
  animate,
  motion,
  motionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import type { MotionValue } from 'motion/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  CARD_SPRING,
  unionOf,
  useSpace,
} from '@kestack/devtools-kabuki/devtools';
import type { Plan } from '@kestack/devtools-kabuki/devtools';
import { connectorsOf } from '../logic/shared/index.js';
import type { Connector, Stage } from '../logic/shared/index.js';
import { Card } from './card.js';
import { WIDTH, curveOf, layout, middleOf, pathOf } from './layout.js';
import type { Placed, Point } from './layout.js';

const GUESS = 120;

const SETTLE = 700;

const TOP = 52;

const insetOf = (stage: HTMLElement | null) => {
  const overlay = stage?.querySelector('[data-story-overlay]');
  if (!stage || !overlay) return { top: TOP, bottom: 0 };
  return {
    top: TOP,
    bottom:
      stage.getBoundingClientRect().bottom -
      overlay.getBoundingClientRect().top,
  };
};

interface Place {
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
}

const pointOf = (place: Place): Point => ({
  x: place.x.get(),
  y: place.y.get(),
});

function Box({
  placed,
  place,
  still,
  onHeight,
  children,
}: {
  readonly placed: Placed;
  readonly place: Place;
  readonly still: boolean;
  readonly onHeight: (path: string, height: number) => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const path = placed.plan.path;
  useLayoutEffect(() => {
    if (ref.current) onHeight(path, ref.current.offsetHeight);
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      onHeight(path, element.offsetHeight),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [path, onHeight]);
  useEffect(() => {
    if (still) {
      place.x.jump(placed.x);
      place.y.jump(placed.y);
      return;
    }
    const moves = [
      animate(place.x, placed.x, CARD_SPRING),
      animate(place.y, placed.y, CARD_SPRING),
    ];
    return () => moves.forEach((move) => move.stop());
  }, [place, placed.x, placed.y, still]);
  return (
    <motion.div
      ref={ref}
      className="absolute top-0 left-0 cursor-default"
      style={{ x: place.x, y: place.y, width: WIDTH }}
    >
      {children}
    </motion.div>
  );
}

function Edge({
  from,
  to,
  connector,
}: {
  readonly from: Place;
  readonly to: Place;
  readonly connector: Connector;
}) {
  const d = useTransform(() => pathOf(curveOf(pointOf(from), pointOf(to))));
  if (!connector.tree && !connector.lit) return null;
  return (
    <motion.path
      d={d}
      fill="none"
      className={cn(
        'transition-[stroke,stroke-width,opacity] duration-150 ease-out motion-reduce:transition-none',
        connector.lit
          ? connector.tree
            ? 'stroke-running/80 [stroke-width:1.75]'
            : 'stroke-running/50 [stroke-width:1.25]'
          : 'stroke-border [stroke-width:1]',
        connector.quiet && 'opacity-50',
      )}
    />
  );
}

function Chips({
  from,
  to,
  connector,
}: {
  readonly from: Place;
  readonly to: Place;
  readonly connector: Connector;
}) {
  const x = useTransform(() => middleOf(curveOf(pointOf(from), pointOf(to))).x);
  const y = useTransform(() => middleOf(curveOf(pointOf(from), pointOf(to))).y);
  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0"
      style={{ x, y }}
    >
      <ul className="flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5">
        {connector.chips.map(({ label, mark }, at) => (
          <li
            key={at}
            className="flex h-[18px] items-center gap-1 rounded-full border border-running/30 bg-background px-1.5 text-[10.5px] whitespace-nowrap text-foreground/85 shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
          >
            <span aria-hidden className="text-running">
              {mark}
            </span>
            {label}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export function Canvas({
  plan,
  live,
  stage,
  onExplore,
  onToggle,
  onFold,
  onAsk,
  children,
}: {
  readonly plan: Plan;
  readonly live: ReadonlySet<string>;
  readonly stage: Stage;
  readonly onExplore: () => void;
  readonly onToggle: (actor: string, ref: string) => void;
  readonly onFold: (actor: string, fold: string) => void;
  readonly onAsk: (chip: string) => void;
  readonly children: ReactNode;
}) {
  const space = useSpace();
  const reduced = useReducedMotion() ?? false;
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const onHeight = useCallback((path: string, height: number) => {
    setHeights((was) =>
      Math.abs((was.get(path) ?? -1) - height) < 1
        ? was
        : new Map(was).set(path, height),
    );
  }, []);
  const placed = layout(plan, (path) => heights.get(path) ?? GUESS);
  const at = new Map(placed.map((one) => [one.plan.path, one]));
  const measured = placed.every(({ plan: one }) => heights.has(one.path));
  const [drawn, setDrawn] = useState(false);

  const places = useRef(new Map<string, Place>());
  const placeOf = (one: Placed) => {
    const known = places.current.get(one.plan.path);
    if (known) return known;
    const fresh = { x: motionValue(one.x), y: motionValue(one.y) };
    places.current.set(one.plan.path, fresh);
    return fresh;
  };

  const { mode, focus, picture } = stage;
  const story = mode === 'story';
  const connectors = connectorsOf(plan, picture, story);
  const focused = story ? picture.focus?.path : undefined;
  const aimed = focused === undefined ? undefined : at.get(focused);
  const beatKey =
    story && focus !== null ? `${focus.turn}:${focus.index}` : null;

  const showAll = () => {
    const all = unionOf(placed);
    if (all) space.show(all);
  };

  useEffect(() => {
    if (drawn || !measured || !space.ready) return;
    const all = unionOf(placed);
    if (all) space.show(all, { least: 0.6, jump: true });
    setDrawn(true);
  });

  const frame = useRef<HTMLDivElement>(null);
  const shown = useRef<{ beat: string; rect: string; at: number } | null>(null);
  useEffect(() => {
    if (!story) shown.current = null;
    if (!drawn || !space.ready || beatKey === null || !aimed) return;
    const rect = `${aimed.x}:${aimed.y}:${aimed.height}`;
    const was = shown.current;
    const now = performance.now();
    const settling = was?.beat === beatKey && now - was.at < SETTLE;
    if (was?.beat === beatKey && (was.rect === rect || !settling)) return;
    shown.current = { beat: beatKey, rect, at: settling ? was.at : now };
    space.centre(aimed, insetOf(frame.current));
  });

  return (
    <div
      ref={frame}
      className={cn(
        'relative min-h-0 flex-1 overflow-hidden transition-opacity duration-200',
        !drawn && 'opacity-0',
      )}
    >
      <div
        ref={space.ref}
        onContextMenu={(event) => {
          event.preventDefault();
          showAll();
        }}
        className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{
          backgroundImage:
            'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <motion.div
          className="absolute top-0 left-0"
          style={{
            x: space.x,
            y: space.y,
            scale: space.zoom,
            originX: 0,
            originY: 0,
          }}
        >
          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width={1}
            height={1}
          >
            {connectors.flatMap((connector) => {
              const from = at.get(connector.from);
              const to = at.get(connector.to);
              return from && to
                ? [
                    <Edge
                      key={`${connector.from}->${connector.to}`}
                      from={placeOf(from)}
                      to={placeOf(to)}
                      connector={connector}
                    />,
                  ]
                : [];
            })}
          </svg>
          {placed.map((one) => {
            const path = one.plan.path;
            return (
              <Box
                key={path}
                placed={one}
                place={placeOf(one)}
                still={reduced || !drawn}
                onHeight={onHeight}
              >
                <Card
                  plan={one.plan}
                  live={live.has(path)}
                  lit={picture.cards.get(path) ?? null}
                  mode={mode}
                  focused={path === focused}
                  onExplore={onExplore}
                  onToggle={(ref) => onToggle(path, ref)}
                  onFold={(fold) => onFold(path, fold)}
                  onAsk={onAsk}
                />
              </Box>
            );
          })}
          {connectors.flatMap((connector) => {
            const from = at.get(connector.from);
            const to = at.get(connector.to);
            return from && to && connector.chips.length > 0
              ? [
                  <Chips
                    key={`${connector.from}->${connector.to}`}
                    from={placeOf(from)}
                    to={placeOf(to)}
                    connector={connector}
                  />,
                ]
              : [];
          })}
        </motion.div>
      </div>
      <div
        data-space-ignore
        className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-md border border-border bg-background/90 shadow-sm backdrop-blur"
      >
        {(
          [
            ['Zoom in', PlusIcon, () => space.zoomBy(1.25)],
            ['Zoom out', MinusIcon, () => space.zoomBy(0.8)],
            ['Show everything', MaximizeIcon, showAll],
          ] as const
        ).map(([label, Icon, run]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={run}
            className="flex size-8 items-center justify-center text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none touch:size-11"
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
