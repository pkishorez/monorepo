// oxlint-disable-next-line no-restricted-imports -- a prototype: the camera follows the layout once it is drawn.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { motion } from '@kestack/web-platform/ui/components/motion';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  allOf,
  layout,
  pathTo,
  type GraphNode,
  type Placed,
} from '../read/graph.ts';
import type { Part } from '../story/scenes.ts';
import { ActorNode, CALLOUT, DASH, OPEN_WIDTH, SMALL } from './node.tsx';
import { CARD_SPRING, unionOf, useSpace } from './space.ts';

/*
 * The canvas: every Actor a card, each joined to its parent by a line that
 * says when it exists, in a space to pan and zoom.
 *
 * 1. Fold    the root and its Children open at first; anything deeper
 *            folds, except down to the card chosen.
 * 2. Lay     every card at its own size: small, or open and as tall as it
 *            is drawn. A card that opens or grows pushes its Children and
 *            the rest aside, gliding to their new places.
 * 3. Keep    the camera frames the tree once, when it is first all there,
 *            and then leaves the space where it is: the tree grows and
 *            shrinks from its top left corner. Only a card the reader just
 *            touched, opened, closed, folded or grown, is held where it was
 *            on screen while the rest moves, and an open one is brought
 *            whole into view, its top left corner first. A right click on
 *            a card opens it and brings it to the middle; on the canvas, it
 *            brings the whole tree there. Opening one card never closes
 *            another.
 */

const ANCHOR = 29;
/** How long after a touch the layout's moves keep that card in place, or in the middle. */
const HOLD = 900;

const pathOf = (from: Placed, to: Placed) => {
  const x1 = from.x + from.width;
  const y1 = from.y + ANCHOR;
  const x2 = to.x;
  const y2 = to.y + ANCHOR;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
};

export function Canvas({
  root,
  opened,
  focus,
  frame,
  bring,
  onOpen,
}: {
  readonly root: GraphNode;
  /** The cards open, as many as the reader opened. */
  readonly opened: ReadonlyArray<string>;
  /** The part a Scene points at, ringed in the card it is about: the last opened. */
  readonly focus?: { readonly card: string; readonly part: Part };
  /** Whether the tree is all there yet: it is framed once, when it first is. */
  readonly frame: boolean;
  /** A card to bring to the middle, each time its `key` changes: a Scene's. */
  readonly bring?: { readonly id: string; readonly key: string };
  readonly onOpen: (id: string, open: boolean) => void;
}) {
  const space = useSpace();
  const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const isOpen = useMemo(() => new Set(opened), [opened]);
  /** The card last reached from its parent's, and how many times: it glows once each time. */
  const [flash, setFlash] = useState<{
    readonly id: string;
    readonly count: number;
  } | null>(null);

  const nodes = useMemo(() => allOf(root), [root]);
  const byId = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  // 1. Fold
  const reveal = useMemo(() => {
    const ids = new Set<string>([
      root.id,
      ...root.children.map(({ id }) => id),
    ]);
    for (const id of opened)
      pathTo(root, id)
        .slice(0, -1)
        .forEach((one) => ids.add(one));
    return ids;
  }, [root, opened]);
  const unfolded = (node: GraphNode) =>
    folds.get(node.id) ?? (node === root || reveal.has(node.id));

  // 2. Lay
  const heightOf = (id: string) => heights.get(id) ?? 420;
  const placed = layout(
    root,
    (node) => ({
      ...(isOpen.has(node.id)
        ? { width: OPEN_WIDTH, height: heightOf(node.id) }
        : SMALL),
      // The card a Step's Message was for has it called out above: room for it.
      ...(node.took && node.instance ? { above: CALLOUT } : {}),
    }),
    unfolded,
  );
  const at = new Map(placed.map((one) => [one.node.id, one]));

  // 3. Keep
  /** The card last touched, held in place, or kept in the middle, until `until`. */
  const held = useRef<{ id: string; until: number; center: boolean } | null>(
    null,
  );
  const hold = (id: string, center = false) => {
    held.current = { id, until: performance.now() + HOLD, center };
  };
  const seen = useRef(
    new Map<string, { readonly x: number; readonly y: number }>(),
  );
  const sized = useRef(new Map<string, number>());
  const framed = useRef(false);
  const centered = useRef('');
  const latest = useRef(placed);
  latest.current = placed;
  const settling = useRef<{
    key: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  useEffect(() => () => clearTimeout(settling.current?.timer), []);
  useEffect(() => {
    if (!space.ready) return;
    const was = seen.current;
    seen.current = new Map(
      placed.map((one) => [one.node.id, { x: one.x, y: one.y }]),
    );
    const wasSized = sized.current;
    sized.current = new Map(placed.map((one) => [one.node.id, one.height]));
    // Framed once, when the tree is all there: when it has stopped growing a moment.
    if (!framed.current) {
      if (!frame) return;
      const key = `${placed.length}`;
      if (settling.current?.key === key) return;
      clearTimeout(settling.current?.timer);
      settling.current = {
        key,
        timer: setTimeout(() => {
          framed.current = true;
          const rect = unionOf(latest.current);
          if (rect) space.show(rect, { zoom: 1 });
        }, 500),
      };
      return;
    }
    const touch = held.current;
    if (!touch || performance.now() > touch.until) return;
    const card = at.get(touch.id);
    if (!card) return;
    const before = was.get(touch.id);
    const moved = !before || before.x !== card.x || before.y !== card.y;
    const grew = wasSized.get(touch.id) !== card.height;
    if (!moved && !grew && !touch.center) return;
    const rect = {
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
    };
    if (touch.center) {
      const key = `${touch.id}:${rect.x}:${rect.y}:${rect.height}`;
      if (centered.current !== key) space.center(rect);
      centered.current = key;
      return;
    }
    space.keep(
      before ? { x: card.x - before.x, y: card.y - before.y } : { x: 0, y: 0 },
      isOpen.has(touch.id) ? rect : undefined,
    );
  });

  const brought = useRef<string | undefined>(undefined);
  if (bring && brought.current !== bring.key) {
    brought.current = bring.key;
    hold(bring.id, true);
  }

  const toggle = (id: string, open: boolean) => {
    hold(id);
    onOpen(id, open);
  };
  // A right click: the card opens, if it is not open, and comes to the middle.
  const center = (id: string) => {
    hold(id, true);
    if (!isOpen.has(id)) onOpen(id, true);
    else {
      const card = at.get(id);
      if (card) space.center(card);
    }
  };
  const onMeasure = useCallback((id: string, height: number) => {
    setHeights((was) => {
      if (Math.abs((was.get(id) ?? 0) - height) < 1) return was;
      const touch = held.current;
      const now = performance.now();
      // A card held is held on while what it opened settles: a Child opened
      // from it, growing, must not move it. With none held, growing holds
      // the card that grew.
      if (touch && now < touch.until)
        held.current = { ...touch, until: now + HOLD };
      else held.current = { id, until: now + HOLD, center: false };
      return new Map(was).set(id, height);
    });
  }, []);

  const fit = () => {
    const rect = unionOf(placed);
    if (rect) space.show(rect, { zoom: 1 });
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={space.ref}
        // A right click on the canvas brings the whole tree to the middle.
        onContextMenu={(event) => {
          event.preventDefault();
          fit();
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
            {placed.map((child) => {
              const parent = child.parent ? at.get(child.parent) : undefined;
              if (!parent) return null;
              const hot = child.node.change !== undefined;
              return (
                <motion.path
                  key={child.node.id}
                  initial={false}
                  animate={{ d: pathOf(parent, child) }}
                  transition={CARD_SPRING}
                  fill="none"
                  strokeWidth={hot ? 1.75 : 1.25}
                  strokeLinecap="round"
                  strokeDasharray={
                    child.node.condition
                      ? DASH[child.node.condition]
                      : undefined
                  }
                  className={cn(
                    hot ? 'stroke-warning/70' : 'stroke-muted-foreground/40',
                  )}
                />
              );
            })}
          </svg>
          {placed.map((one) => (
            <ActorNode
              key={one.node.id}
              placed={one}
              parent={one.parent ? byId.get(one.parent)?.title : undefined}
              size={isOpen.has(one.node.id) ? 'open' : 'small'}
              {...(focus?.card === one.node.id ? { focus: focus.part } : {})}
              {...(flash?.id === one.node.id ? { flash: flash.count } : {})}
              onOpen={toggle}
              onCenter={center}
              onFold={(id, unfold) => {
                hold(id);
                setFolds((was) => new Map(was).set(id, unfold));
              }}
              onChild={(parent, title) => {
                const child = byId
                  .get(parent)
                  ?.children.find((kid) => kid.title.split(' #')[0] === title);
                if (!child) return;
                // From its parent's card, a Child opens or closes, and glows once to say which.
                setFolds((was) => new Map(was).set(parent, true));
                // The card it was opened from stays where it is; the Child finds its place.
                hold(parent);
                onOpen(child.id, !isOpen.has(child.id));
                setFlash((was) => ({
                  id: child.id,
                  count: (was?.count ?? 0) + 1,
                }));
              }}
              onMeasure={onMeasure}
            />
          ))}
        </motion.div>
      </div>
      <div
        data-space-ignore
        className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-lg border border-border bg-background/90 shadow-sm backdrop-blur"
      >
        {(
          [
            ['Zoom in', PlusIcon, () => space.zoomBy(1.25)],
            ['Zoom out', MinusIcon, () => space.zoomBy(0.8)],
            ['Show everything', MaximizeIcon, fit],
          ] as const
        ).map(([label, Icon, run]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={run}
            className="flex size-11 items-center justify-center text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none md:size-9"
          >
            <Icon aria-hidden className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
