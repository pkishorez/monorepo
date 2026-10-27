import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '#kit/class-names';
import {
  allOf,
  layout,
  pathTo,
  providerOf,
  type GraphNode,
  type Placed,
} from '../read/graph.ts';
import type { Part } from '../story/story.ts';
import {
  ActorNode,
  anchorOf,
  DASH,
  OPEN_WIDTH,
  smallOf,
  type Use,
} from './node.tsx';
import { CARD_SPRING, unionOf, useSpace } from './space.ts';

/*
 * The canvas: every Actor a card, each joined to its parent by a line that
 * says when it exists, in a space to pan and zoom.
 *
 * 1. Fold    the root and its Children open at first; anything deeper
 *            folds, except down to the card chosen.
 * 2. Lay     every card at its own size: small, or open and as tall as it
 *            is drawn, each at the top of its block. A card that opens or
 *            grows pushes down only what is under it, gliding; nothing
 *            above it moves.
 * 3. Keep    the tree is laid out, framed and settled out of sight, and
 *            only then drawn, already in place, so nothing moves as it
 *            appears. The camera frames it once, and then leaves the
 *            space where it is: the tree grows and
 *            shrinks from its top left corner. Only a card the reader just
 *            touched, opened, closed, folded or grown, is held where it was
 *            on screen while the rest moves, and one just opened is brought
 *            whole into view, its top left corner first; one that only
 *            grew is left where it is. A right click on a card, or a long
 *            press where the browser reads one as a right click, opens it
 *            and brings it to the middle; on the canvas, it brings the
 *            whole tree there. Opening one card never closes another.
 *            Following, as when presenting, it keeps the whole tree in
 *            view instead, as it grows and shrinks.
 */

/** How long after a touch the layout's moves keep that card in place, or in the middle. */
const HOLD = 900;
/** How long, in milliseconds, the tree keeps still out of sight before it is drawn. */
const SETTLE = 120;

const pathOf = (from: Placed, to: Placed) => {
  const x1 = from.x + from.width;
  const y1 = from.y + anchorOf(from);
  const x2 = to.x;
  const y2 = to.y + anchorOf(to);
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
};

export function Canvas({
  root,
  opened,
  focus,
  frame,
  follow = false,
  dotted = true,
  spotlight,
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
  /** Keep the whole tree in view as it grows and shrinks, for a talk or a recording. */
  readonly follow?: boolean;
  /** Dots under the cards. On by default; off, what is behind shows through. */
  readonly dotted?: boolean;
  /** The cards a Story's Scene is about: every other card, and every line not between two of them, is drawn faint. */
  readonly spotlight?: ReadonlySet<string>;
  /** A card to bring into view, each time its `key` changes, framed with the cards `with` it: a Scene's. */
  readonly bring?: {
    readonly id: string;
    readonly key: string;
    readonly with?: ReadonlyArray<string>;
  };
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
  // The tab on the card a Step's Message was for sits in the gap above it,
  // kept no room of its own: stepping through, no card moves for it.
  const placed = layout(
    root,
    (node) =>
      isOpen.has(node.id)
        ? { width: OPEN_WIDTH, height: heightOf(node.id) }
        : smallOf(node),
    unfolded,
  );
  const at = new Map(placed.map((one) => [one.node.id, one]));

  // 3. Keep
  /** The card last touched, held in place, or kept in the middle, until `until`. */
  const held = useRef<{
    id: string;
    until: number;
    center: boolean;
    /** Opened or closed by the reader: brought whole into view. One that only grew is not, so the camera stays still. */
    reveal: boolean;
    /** Brought by a Scene: framed whole with these cards, as near as the text reads at its own size. */
    group?: ReadonlyArray<string>;
  } | null>(null);
  const hold = (
    id: string,
    center = false,
    reveal = true,
    group?: ReadonlyArray<string>,
  ) => {
    held.current = {
      id,
      until: performance.now() + HOLD,
      center,
      reveal,
      ...(group ? { group } : {}),
    };
  };
  const seen = useRef(
    new Map<string, { readonly x: number; readonly y: number }>(),
  );
  const sized = useRef(new Map<string, number>());
  const framed = useRef(false);
  /** Whether the tree is on screen: it is laid out, framed and settled out of sight first. */
  const [drawn, setDrawn] = useState(false);
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
    if (follow) {
      const rect = unionOf(placed);
      if (!rect) return;
      const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
      if (centered.current !== key) space.show(rect, { zoom: 1, jump: !drawn });
      centered.current = key;
      if (!drawn) setDrawn(true);
      return;
    }
    // Framed once, out of sight, when the tree is all there and has kept
    // still a moment: then drawn, already in place, and nothing moves. A
    // card a Scene brought is framed then, with the cards beside it.
    if (!framed.current) {
      if (!frame) return;
      const all = unionOf(placed);
      const key = `${placed.length}:${all?.width}:${all?.height}`;
      if (settling.current?.key === key) return;
      clearTimeout(settling.current?.timer);
      settling.current = {
        key,
        timer: setTimeout(() => {
          framed.current = true;
          const now = latest.current;
          const touch = held.current;
          const brought = touch?.group
            ? now.filter(
                (one) =>
                  one.node.id === touch.id ||
                  touch.group!.includes(one.node.id),
              )
            : [];
          const rect = unionOf(brought.length > 0 ? brought : now);
          if (rect) space.show(rect, { zoom: 1, jump: true });
          // What was brought is framed already; nothing glides to it again.
          if (brought.length > 0) held.current = null;
          setDrawn(true);
        }, SETTLE),
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
    if (touch.group) {
      const framed = unionOf([
        rect,
        ...touch.group.flatMap((id) => {
          const one = at.get(id);
          return one ? [one] : [];
        }),
      ])!;
      const key = `${touch.id}:${framed.x}:${framed.y}:${framed.width}:${framed.height}`;
      if (centered.current !== key) space.show(framed, { zoom: 1 });
      centered.current = key;
      return;
    }
    if (touch.center) {
      const key = `${touch.id}:${rect.x}:${rect.y}:${rect.height}`;
      if (centered.current !== key) space.center(rect);
      centered.current = key;
      return;
    }
    space.keep(
      before ? { x: card.x - before.x, y: card.y - before.y } : { x: 0, y: 0 },
      touch.reveal && isOpen.has(touch.id) ? rect : undefined,
    );
  });

  const brought = useRef<string | undefined>(undefined);
  if (bring && brought.current !== bring.key) {
    brought.current = bring.key;
    hold(bring.id, true, true, bring.with ?? []);
  }

  const toggle = (id: string, open: boolean) => {
    hold(id);
    onOpen(id, open);
  };

  // 4. Share: a Capability picked, in a card that requires it or one that
  // provides it, and everyone who shares it: the card that provides it,
  // or none for a Service the app's Layer hands in, and every card that
  // gets it from there. All of them open, framed together, the Capability
  // lit in each, and the cards between them, the way it comes down, in
  // the spotlight. Picked again, or Escape, lets go.
  const uses = useMemo(
    () =>
      new Map(
        nodes.map((node) => [
          node.id,
          node.print.requires.map((name): Use => ({
            name,
            from: providerOf(root, node.id, name) ?? null,
          })),
        ]),
      ),
    [root, nodes],
  );
  const [share, setShare] = useState<{
    readonly name: string;
    /** The card that provides it; null for a Service. */
    readonly provider: string | null;
    /** The card it was picked in, framed first. */
    readonly from: string;
  } | null>(null);
  const shared = useMemo(() => {
    if (!share || (share.provider !== null && !byId.has(share.provider)))
      return undefined;
    const users = nodes
      .filter((node) =>
        (uses.get(node.id) ?? []).some(
          (use) => use.name === share.name && use.from === share.provider,
        ),
      )
      .map(({ id }) => id);
    const way = new Set<string>(share.provider ? [share.provider] : []);
    for (const user of users) {
      const path = pathTo(root, user);
      const start = share.provider ? path.indexOf(share.provider) : 0;
      path.slice(Math.max(0, start)).forEach((id) => way.add(id));
    }
    return { ...share, users, way };
  }, [share, byId, nodes, uses, root]);
  const lit = shared ? shared.way : spotlight;
  useEffect(() => {
    if (!shared) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShare(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shared]);
  const focusOf = (id: string): Part | undefined =>
    shared?.provider === id
      ? { kind: 'provides', name: shared.name }
      : shared?.users.includes(id)
        ? { kind: 'requires', name: shared.name }
        : focus?.card === id
          ? focus.part
          : undefined;
  const pick = (id: string, name: string, side: 'requires' | 'provides') => {
    const provider =
      side === 'provides'
        ? id
        : ((uses.get(id) ?? []).find((use) => use.name === name)?.from ?? null);
    if (shared && shared.name === name && shared.provider === provider)
      return setShare(null);
    setShare({ name, provider, from: id });
    const users = nodes
      .filter((node) =>
        (uses.get(node.id) ?? []).some(
          (use) => use.name === name && use.from === provider,
        ),
      )
      .map((node) => node.id);
    const all = [...(provider ? [provider] : []), ...users];
    for (const one of all) if (!isOpen.has(one)) onOpen(one, true);
    hold(
      id,
      true,
      true,
      all.filter((one) => one !== id),
    );
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
      else
        held.current = { id, until: now + HOLD, center: false, reveal: false };
      return new Map(was).set(id, height);
    });
  }, []);

  const fit = () => {
    const rect = unionOf(placed);
    if (rect) space.show(rect, { zoom: 1 });
  };

  return (
    <div
      className={cn(
        'relative min-h-0 flex-1 overflow-hidden',
        !drawn && 'opacity-0',
      )}
    >
      <div
        ref={space.ref}
        // A right click on the canvas brings the whole tree to the middle.
        onContextMenu={(event) => {
          event.preventDefault();
          fit();
        }}
        className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
        style={
          dotted
            ? {
                backgroundImage:
                  'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }
            : undefined
        }
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
              const change = child.node.change;
              const shown =
                !lit || (lit.has(child.node.id) && lit.has(parent.node.id));
              const hot = change !== undefined;
              return (
                <motion.path
                  key={child.node.id}
                  initial={false}
                  animate={{ d: pathOf(parent, child) }}
                  // Out of sight, everything is where it goes at once.
                  transition={drawn ? CARD_SPRING : { duration: 0 }}
                  fill="none"
                  strokeWidth={hot || (shared && shown) ? 1.75 : 1.25}
                  strokeLinecap="round"
                  strokeDasharray={
                    child.node.condition
                      ? DASH[child.node.condition]
                      : undefined
                  }
                  className={cn(
                    'transition-opacity duration-300 motion-reduce:transition-none',
                    !shown && 'opacity-20',
                    !change
                      ? 'stroke-muted-foreground/40'
                      : change.kind === 'added'
                        ? 'stroke-added/70'
                        : 'stroke-changed/60',
                  )}
                />
              );
            })}
          </svg>
          {placed.map((one) => (
            <ActorNode
              key={one.node.id}
              placed={one}
              still={!drawn}
              size={isOpen.has(one.node.id) ? 'open' : 'small'}
              {...(focusOf(one.node.id)
                ? { focus: focusOf(one.node.id)! }
                : {})}
              dim={lit !== undefined && !lit.has(one.node.id)}
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
              uses={uses.get(one.node.id) ?? []}
              onCapability={pick}
              onMeasure={onMeasure}
            />
          ))}
        </motion.div>
      </div>
      {/* Following, as when presenting, nothing to press. */}
      {!follow && (
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
              className="flex size-9 items-center justify-center text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none touch:size-11"
            >
              <Icon aria-hidden className="size-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
