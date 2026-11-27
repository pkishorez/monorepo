import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { foldOf } from '../logic/shared/index.ts';
import type { Board as Shown, Trace } from '../logic/shared/index.ts';
import { Card } from './card.tsx';
import { WIDTH, anchorOf, branch, layout, link, loop } from './layout.ts';
import type { Curve } from './layout.ts';
import { Chip } from './message.tsx';
import { MoreCard } from './more.tsx';
import type { Placed } from './layout.ts';
import { CARD_SPRING, unionOf, useSpace } from './shared/index.ts';

interface Size {
  readonly height: number;
  readonly top: number;
  readonly from?: number;
  readonly to?: number;
}

const GUESS = 240;

const sameSize = (a: Size | undefined, b: Size) =>
  a !== undefined &&
  Math.abs(a.height - b.height) < 1 &&
  a.top === b.top &&
  a.from === b.from &&
  a.to === b.to;

const sizeOf = (element: HTMLElement, zoom: number): Size => {
  const top = element.getBoundingClientRect().top;
  const row = element.querySelector('[data-sending]')?.getBoundingClientRect();
  const band = element.querySelector<HTMLElement>('[data-band]');
  const body = element.querySelector<HTMLElement>('[data-body]');
  return {
    height: element.offsetHeight,
    top: body?.offsetTop ?? 0,
    ...(band ? { to: Math.round(band.offsetTop + band.offsetHeight / 2) } : {}),
    ...(row
      ? { from: Math.round((row.top + row.height / 2 - top) / zoom) }
      : {}),
  };
};

function Box({
  placed,
  appear,
  zoom,
  onSize,
  children,
}: {
  readonly placed: Placed;
  readonly appear: boolean;
  readonly zoom: MotionValue<number>;
  readonly onSize: (address: string, size: Size) => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const address = placed.id;
  useLayoutEffect(() => {
    if (ref.current) onSize(address, sizeOf(ref.current, zoom.get()));
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      onSize(address, sizeOf(element, zoom.get())),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [address, onSize, zoom]);
  return (
    <motion.div
      ref={ref}
      data-card
      initial={appear ? { opacity: 0, x: placed.x - 16, y: placed.y } : false}
      animate={{ opacity: 1, x: placed.x, y: placed.y }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={CARD_SPRING}
      className="absolute top-0 left-0 flex cursor-default flex-col"
      style={{ width: WIDTH }}
    >
      {children}
    </motion.div>
  );
}

function Edge({
  d,
  appear,
  className,
  tip = false,
}: {
  readonly d: string;
  readonly appear: boolean;
  readonly className: string;
  readonly tip?: boolean;
}) {
  return (
    <motion.path
      initial={appear ? { opacity: 0, d } : false}
      animate={{ opacity: 1, d }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={CARD_SPRING}
      fill="none"
      className={className}
      {...(tip ? { markerEnd: 'url(#kabuki-tip)' } : {})}
    />
  );
}

const FLOW = 'stroke-running [stroke-dasharray:4_3] [stroke-width:1.5]';

function Label({
  at,
  side,
  appear,
  children,
}: {
  readonly at: { readonly x: number; readonly y: number };
  readonly side: 'middle' | 'right' | 'left';
  readonly appear: boolean;
  readonly children: string;
}) {
  return (
    <motion.div
      initial={appear ? { opacity: 0, x: at.x, y: at.y } : false}
      animate={{ opacity: 1, x: at.x, y: at.y }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={CARD_SPRING}
      className="pointer-events-none absolute top-0 left-0"
    >
      <span
        className={cn(
          'block -translate-y-1/2 rounded-full border border-running/40 bg-background px-1.5 py-px text-[10.5px] font-medium whitespace-nowrap text-running shadow-[0_1px_2px_rgb(0_0_0/0.06)]',
          side === 'middle' && '-translate-x-1/2',
          side === 'right' && '-translate-x-1/4',
          side === 'left' && '-translate-x-3/4',
        )}
      >
        {children}
      </span>
    </motion.div>
  );
}

export function Board({
  board,
  trace,
  onOpen,
  onStep,
}: {
  readonly board: Shown;
  readonly trace: Trace | null;
  readonly onOpen: (address: string) => void;
  readonly onStep: (id: number) => void;
}) {
  const space = useSpace();
  const [sizes, setSizes] = useState<ReadonlyMap<string, Size>>(
    () => new Map(),
  );
  const [drawn, setDrawn] = useState(false);
  const onSize = useCallback((address: string, size: Size) => {
    setSizes((was) =>
      sameSize(was.get(address), size) ? was : new Map(was).set(address, size),
    );
  }, []);

  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const flip = (set: ReadonlySet<string>, one: string) => {
    const next = new Set(set);
    if (!next.delete(one)) next.add(one);
    return next;
  };
  const placed = layout(
    foldOf(board.root, picked, opened),
    (address) => sizes.get(address)?.height ?? GUESS,
    (address) => sizes.get(address)?.top ?? 0,
  );
  const at = new Map(placed.map((one) => [one.id, one]));
  const target = board.message?.to;
  const followed = () =>
    unionOf(
      [target, board.sender ?? undefined].flatMap((address) => {
        const one = address === undefined ? undefined : at.get(address);
        return one ? [one] : [];
      }),
    );
  const measured = placed.every(({ id }) => sizes.has(id));
  const showAll = () => {
    const all = unionOf(placed);
    if (all) space.show(all);
  };

  useEffect(() => {
    if (drawn || !measured || !space.ready) return;
    const all = unionOf(placed);
    if (all) space.show(all, { least: 1, jump: true });
    const pair = followed();
    if (pair) space.keep(pair);
    setDrawn(true);
  });

  const shownKey = useRef(board.key);
  const wasReady = useRef(space.ready);
  useEffect(() => {
    const opened = space.ready && !wasReady.current;
    wasReady.current = space.ready;
    if (!drawn || !space.ready) return;
    if (!opened && shownKey.current === board.key) return;
    shownKey.current = board.key;
    const pair = followed();
    if (pair) space.keep(pair);
  });

  const looped =
    board.loop && target !== undefined ? at.get(target) : undefined;
  const turns = looped ? sizes.get(looped.id) : undefined;
  const aim = target === undefined ? undefined : at.get(target);
  const chipAt = target === undefined ? undefined : sizes.get(target)?.to;
  const sender = board.sender === null ? undefined : at.get(board.sender);
  const sentAt =
    board.sender === null ? undefined : sizes.get(board.sender)?.from;
  const loopRight = looped ? looped.leaf : true;
  const curve: (Curve & { readonly side: 'middle' | 'right' | 'left' }) | null =
    sender && aim
      ? {
          ...link(
            sender,
            sentAt === undefined ? anchorOf(sender) : sender.y + sentAt,
            aim,
            chipAt === undefined ? anchorOf(aim) : aim.y + chipAt,
          ),
          side: 'middle',
        }
      : looped && turns?.from !== undefined && turns.to !== undefined
        ? {
            ...loop(looped, turns.from, turns.to, loopRight),
            side: loopRight ? 'right' : 'left',
          }
        : null;

  return (
    <MotionConfig reducedMotion="user">
      <div
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
              <defs>
                <marker
                  id="kabuki-tip"
                  viewBox="0 0 8 8"
                  refX="8"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-running)" />
                </marker>
              </defs>
              <AnimatePresence>
                {placed.flatMap((child) => {
                  const parent = child.parent ? at.get(child.parent) : null;
                  return parent
                    ? [
                        <Edge
                          key={child.id}
                          d={branch(parent, child)}
                          appear={drawn}
                          className={cn(
                            'stroke-border [stroke-width:1]',
                            child.more && '[stroke-dasharray:3_3]',
                          )}
                        />,
                      ]
                    : [];
                })}
                {curve && (
                  <Edge
                    key={`message:${board.key}`}
                    d={curve.d}
                    appear={drawn}
                    className={FLOW}
                    tip
                  />
                )}
                {curve && board.sender !== null && (
                  <motion.circle
                    key={`start:${board.key}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    cx={curve.start.x}
                    cy={curve.start.y}
                    r={3}
                    className="fill-running"
                  />
                )}
              </AnimatePresence>
            </svg>
            <AnimatePresence>
              {placed.map((one) => (
                <Box
                  key={one.id}
                  placed={one}
                  appear={drawn}
                  zoom={space.zoom}
                  onSize={onSize}
                >
                  {one.card?.target && trace && (
                    <Chip
                      trace={trace}
                      payload={board.payload}
                      onStep={onStep}
                    />
                  )}
                  {one.card && (
                    <Card
                      card={one.card}
                      compared={board.compared}
                      onOpen={onOpen}
                    />
                  )}
                  {one.more && (
                    <MoreCard
                      more={one.more}
                      picked={picked}
                      onPick={(address) =>
                        setPicked((was) => flip(was, address))
                      }
                      onOpen={() =>
                        setOpened((was) => flip(was, one.more!.parent))
                      }
                    />
                  )}
                </Box>
              ))}
            </AnimatePresence>
            <AnimatePresence>
              {curve && board.via && (
                <Label
                  key={`label:${board.key}`}
                  at={curve.middle}
                  side={curve.side}
                  appear={drawn}
                >
                  {board.via}
                </Label>
              )}
            </AnimatePresence>
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
      </div>
    </MotionConfig>
  );
}
