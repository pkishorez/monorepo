import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useMotionTemplate,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useLayoutEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Card } from './card.tsx';
import { Details } from './details.tsx';
import { CARD_HEIGHT, CARD_WIDTH, layout, lineOf } from './layout.ts';
import type { Placed } from './layout.ts';
import { CARD_SPRING, unionOf, useSpace } from './space.ts';
import { all, find, pathOf, root } from './tree.ts';
import type { Node } from './tree.ts';

/*
 * The Actor tree as a map: top to bottom, in a space to pan and zoom.
 *
 * 1. Unfold   clicking a card brings its Children out of it, right there. The
 *             card clicked stays exactly where it is on screen, at the same
 *             zoom, unfolding or folding; what is beside it moves aside.
 * 2. Explain  the button on a card opens a dialog with all of it. Closing it
 *             is back on the map, exactly where it was.
 * 3. Far      zoomed out, only names are drawn, as on any map.
 */

/** Below this zoom a card draws only its name. */
const FAR = 0.5;

const ancestorsOf = (node: Node) => pathOf(node).slice(0, -1);

const openFor = (node: Node) => new Set(ancestorsOf(node).map((at) => at.id));

const focusCard = (id: string) => {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)
      ?.focus();
  });
};

const familyOf = (node: Node, within: ReadonlyArray<Placed>) => {
  const family = unionOf(
    within.filter(
      (one) => one.node.id === node.id || one.parent?.node.id === node.id,
    ),
  );
  const parent = within.find((one) => one.node.id === node.id)?.parent;
  if (!family || !parent) return family;
  return {
    ...family,
    y: parent.y,
    height: family.y + family.height - parent.y,
  };
};

const remember = (node: Node) => {
  const url = new URL(window.location.href);
  url.searchParams.set('at', node.id);
  window.history.replaceState(null, '', url);
};

export function ActorStory({ actions }: { actions: ReactNode }) {
  const space = useSpace();
  const [current, setCurrent] = useState<Node>(() =>
    find(new URLSearchParams(window.location.search).get('at')),
  );
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set([root.id, ...openFor(current)]),
  );
  const [explained, setExplained] = useState<{
    readonly node: Node;
    readonly open: boolean;
  }>({ node: current, open: false });
  const [far, setFar] = useState(false);
  const [drawn, setDrawn] = useState(false);

  /** How far the tree is slid sideways, so the card last clicked has not moved. */
  const [shift, setShift] = useState(0);
  const placed = useMemo(() => layout(root, open, shift), [open, shift]);
  const at = useMemo(
    () => new Map(placed.map((one) => [one.node.id, one])),
    [placed],
  );
  const lit = useMemo(
    () => new Set(pathOf(current).map((node) => node.id)),
    [current],
  );

  useMotionValueEvent(space.zoom, 'change', (zoom) => setFar(zoom < FAR));

  // The dots belong to the space: they move and scale with what is on it.
  const dots = useTransform(space.zoom, (zoom) => {
    const size = 24 * zoom * (zoom < 0.4 ? 4 : 1);
    return `${size}px ${size}px`;
  });
  const dotsAt = useMotionTemplate`${space.x}px ${space.y}px`;

  const toggle = (node: Node) => {
    setCurrent(node);
    remember(node);
    const opening = !open.has(node.id);
    const next = new Set(open);
    if (opening) next.add(node.id);
    else next.delete(node.id);
    setOpen(next);
    // The camera never moves for this: the tree is laid out so that this card
    // lands exactly where it is, and has nothing to animate.
    const was = at.get(node.id);
    const now = layout(root, next).find((one) => one.node.id === node.id);
    if (was && now) setShift(was.x - now.x);
  };

  const explain = (node: Node) => {
    setCurrent(node);
    remember(node);
    setExplained({ node, open: true });
  };

  /** Goes to a card anywhere on the tree, unfolding the way to it, at the same zoom. */
  const goTo = (node: Node) => {
    setCurrent(node);
    remember(node);
    setExplained((now) => ({ ...now, open: false }));
    const next = new Set([...open, ...openFor(node)]);
    setOpen(next);
    const card = layout(root, next, shift).find(
      (one) => one.node.id === node.id,
    );
    if (card) space.center(card);
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, node: Node) => {
    const siblings = node.parent?.children ?? [node];
    const index = siblings.indexOf(node);
    const move = (to: Node | undefined) => {
      event.preventDefault();
      if (to) focusCard(to.id);
    };
    if (event.key === 'ArrowUp') move(node.parent ?? undefined);
    else if (event.key === 'ArrowLeft') move(siblings[index - 1]);
    else if (event.key === 'ArrowRight') move(siblings[index + 1]);
    else if (event.key === 'ArrowDown') {
      if (node.children.length > 0 && !open.has(node.id)) toggle(node);
      move(node.children[0]);
    } else if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      explain(node);
    }
  };

  const everyOpen = all.every(
    (node) => node.children.length === 0 || open.has(node.id),
  );
  const showAll = (within: ReadonlyArray<Placed> = placed) => {
    const rect = unionOf(within);
    if (rect) space.show(rect, { zoom: 1 });
  };
  const foldOrUnfold = () => {
    const next = everyOpen
      ? new Set([root.id])
      : new Set(
          all.filter((node) => node.children.length > 0).map((node) => node.id),
        );
    setOpen(next);
    if (everyOpen) {
      setCurrent(root);
      remember(root);
    }
    showAll(layout(root, next, shift));
  };

  // Framed once, out of sight, as soon as the space has a size.
  useLayoutEffect(() => {
    if (!space.ready || drawn) return;
    const family = familyOf(current, placed);
    if (family) space.show(family, { zoom: 1, least: 0.35, jump: true });
    setDrawn(true);
  }, [space, drawn, placed, current]);

  const path = pathOf(current);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
          <nav
            aria-label="Where you are"
            className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm whitespace-nowrap"
          >
            <span className="mr-2 font-medium">code</span>
            {path.map((node, index) => (
              <span key={node.id} className="flex items-center gap-1">
                <span className="text-muted-foreground/60" aria-hidden="true">
                  ›
                </span>
                {index === path.length - 1 ? (
                  <span aria-current="location">{node.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => goTo(node)}
                    className="cursor-pointer rounded px-1 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50"
                  >
                    {node.name}
                  </button>
                )}
              </span>
            ))}
          </nav>
          <div className="shrink-0">{actions}</div>
        </header>
        <div
          className={`relative min-h-0 flex-1 overflow-hidden ${drawn ? '' : 'opacity-0'}`}
        >
          <motion.div
            ref={space.ref}
            onScroll={(event) => event.currentTarget.scrollTo(0, 0)}
            className="absolute inset-0 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
            style={{
              backgroundImage:
                'radial-gradient(circle, var(--border) 1px, transparent 1px)',
              backgroundSize: dots,
              backgroundPosition: dotsAt,
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
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 overflow-visible"
                width={1}
                height={1}
              >
                <AnimatePresence initial={false}>
                  {placed.flatMap((one) => {
                    const parent = one.parent;
                    if (!parent) return [];
                    const onPath = lit.has(one.node.id);
                    return (
                      <motion.path
                        key={one.node.id}
                        initial={{ d: lineOf(parent, parent) }}
                        animate={{ d: lineOf(parent, one) }}
                        transition={CARD_SPRING}
                        fill="none"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        strokeWidth={onPath ? 1.75 : 1.25}
                        strokeDasharray={
                          one.node.exists.how === 'while' ? '5 5' : undefined
                        }
                        className={
                          onPath
                            ? 'stroke-foreground/70'
                            : far
                              ? 'stroke-muted-foreground/70'
                              : 'stroke-muted-foreground/40'
                        }
                      />
                    );
                  })}
                </AnimatePresence>
              </svg>
              <AnimatePresence initial={false}>
                {placed.map((one) => {
                  return (
                    <motion.div
                      key={one.node.id}
                      className="absolute top-0 left-0"
                      style={{
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        zIndex: 20 - pathOf(one.node).length,
                      }}
                      // A Child comes out of its parent.
                      initial={{
                        x: one.parent?.x ?? one.x,
                        y: one.parent?.y ?? one.y,
                        opacity: 0,
                        scale: 0.96,
                      }}
                      animate={{
                        x: one.x,
                        y: one.y,
                        opacity: 1,
                        scale: 1,
                      }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{
                        ...CARD_SPRING,
                        opacity: { duration: 0.15 },
                      }}
                    >
                      <Card
                        node={one.node}
                        open={open.has(one.node.id)}
                        here={one.node.id === current.id}
                        far={far}
                        onClick={() =>
                          one.node.children.length > 0
                            ? toggle(one.node)
                            : explain(one.node)
                        }
                        onExplain={() => explain(one.node)}
                        onKeyDown={(event) => onKey(event, one.node)}
                        onFocus={() => {
                          if (
                            document.activeElement?.matches(':focus-visible')
                          ) {
                            setCurrent(one.node);
                            space.keep({ x: 0, y: 0 }, one);
                          }
                        }}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </motion.div>
          <div
            data-space-ignore
            className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-lg border border-border bg-background/90 shadow-sm backdrop-blur"
          >
            {(
              [
                ['Zoom in', PlusIcon, () => space.zoomBy(1.25)],
                ['Zoom out', MinusIcon, () => space.zoomBy(0.8)],
                ['Show everything', MaximizeIcon, () => showAll()],
              ] as const
            ).map(([label, Icon, run]) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                title={label}
                onClick={run}
                className="flex size-9 cursor-pointer touch-manipulation items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/50 pointer-coarse:size-11"
              >
                <Icon aria-hidden="true" className="size-4" />
              </button>
            ))}
          </div>
          <button
            type="button"
            data-space-ignore
            onClick={foldOrUnfold}
            className="absolute top-3 left-3 flex min-h-9 cursor-pointer touch-manipulation items-center rounded-lg border border-border bg-background/90 px-3 text-[13px] shadow-sm backdrop-blur transition-colors duration-150 hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50 pointer-coarse:min-h-11"
          >
            {everyOpen ? 'Fold everything' : 'Unfold everything'}
          </button>
          <p className="pointer-events-none absolute bottom-3 left-3 hidden max-w-[34rem] rounded-lg bg-background/90 px-3 py-2 text-xs leading-relaxed text-pretty text-muted-foreground backdrop-blur md:block">
            Click a card to unfold it. Drag to move, scroll to zoom. The corner
            button explains a card. A stack is one per key, dashed may be
            absent.
          </p>
        </div>
        <Details
          node={explained.node}
          open={explained.open}
          onClose={() => setExplained((now) => ({ ...now, open: false }))}
          onGo={goTo}
        />
      </div>
    </MotionConfig>
  );
}
