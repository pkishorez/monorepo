import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  allOf,
  pathTo,
  usersOf,
  usesOf,
  wayOf,
} from '../../../logic/shared/index.ts';
import type { Card, Part, Use } from '../../../logic/shared/index.ts';
import {
  CardNode,
  DASH,
  OPEN_WIDTH,
  anchorOf,
  smallOf,
} from '../card/card.tsx';
import { layout } from './layout.ts';
import type { Placed } from './layout.ts';
import { CARD_SPRING, unionOf, useSpace } from './space.ts';

const HOLD = 900;
const SETTLE = 120;

const pathOf = (from: Placed, to: Placed) => {
  const x1 = from.x + from.width;
  const y1 = from.y + anchorOf(from);
  const x2 = to.x;
  const y2 = to.y + anchorOf(to);
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
};

interface Held {
  readonly id: string | null;
  readonly until: number;
  readonly center: boolean;
  readonly reveal: boolean;
  readonly group?: ReadonlyArray<string>;
}

export function Canvas({
  root,
  opened,
  bodies,
  follow = false,
  bring,
  unfold,
  folding = true,
  onOpen,
}: {
  readonly root: Card;
  readonly opened: ReadonlyArray<string>;
  readonly bodies?: ReadonlyMap<string, ReactNode>;
  readonly follow?: boolean;
  readonly bring?: { readonly id?: string; readonly key: string } | null;
  readonly unfold?: (card: Card) => boolean;
  readonly folding?: boolean;
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
  const [flash, setFlash] = useState<{
    readonly id: string;
    readonly count: number;
  } | null>(null);

  const cards = useMemo(() => allOf(root), [root]);
  const byId = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );

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
  const above = useMemo(
    () => new Set(opened.flatMap((id) => pathTo(root, id).slice(0, -1))),
    [root, opened],
  );
  const unfolded = (card: Card) =>
    unfold
      ? card === root || unfold(card) || above.has(card.id)
      : (folds.get(card.id) ?? (card === root || reveal.has(card.id)));

  const heightOf = (id: string) => heights.get(id) ?? 420;
  const placed = layout(
    root,
    (card) =>
      isOpen.has(card.id)
        ? { width: OPEN_WIDTH, height: heightOf(card.id) }
        : smallOf(card),
    unfolded,
  );
  const at = new Map(placed.map((one) => [one.card.id, one]));

  const held = useRef<Held | null>(null);
  const hold = (
    id: string | null,
    center = false,
    shown = true,
    group?: ReadonlyArray<string>,
  ) => {
    held.current = {
      id,
      until: performance.now() + HOLD,
      center,
      reveal: shown,
      ...(group ? { group } : {}),
    };
  };
  const seen = useRef(
    new Map<string, { readonly x: number; readonly y: number }>(),
  );
  const sized = useRef(new Map<string, number>());
  const framed = useRef(false);
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
      placed.map((one) => [one.card.id, { x: one.x, y: one.y }]),
    );
    const wasSized = sized.current;
    sized.current = new Map(placed.map((one) => [one.card.id, one.height]));
    if (follow) {
      const rect = unionOf(placed);
      if (!rect) return;
      const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
      if (centered.current !== key) space.show(rect, { zoom: 1, jump: !drawn });
      centered.current = key;
      if (!drawn) setDrawn(true);
      return;
    }
    if (!framed.current) {
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
                  one.card.id === touch.id ||
                  touch.group!.includes(one.card.id),
              )
            : [];
          const rect = unionOf(brought.length > 0 ? brought : now);
          if (rect) space.show(rect, { zoom: 1, jump: true });
          if (brought.length > 0) held.current = null;
          setDrawn(true);
        }, SETTLE),
      };
      return;
    }
    const touch = held.current;
    if (!touch || performance.now() > touch.until) return;
    if (touch.id === null) {
      const all = unionOf(placed);
      if (!all) return;
      const key = `all:${all.x}:${all.y}:${all.width}:${all.height}`;
      if (centered.current !== key) space.show(all, { zoom: 1 });
      centered.current = key;
      return;
    }
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
      const group = unionOf([
        rect,
        ...touch.group.flatMap((id) => {
          const one = at.get(id);
          return one ? [one] : [];
        }),
      ])!;
      const key = `${touch.id}:${group.x}:${group.y}:${group.width}:${group.height}`;
      if (centered.current !== key) space.show(group, { zoom: 1 });
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
    if (bring.id === undefined) hold(null);
    else hold(bring.id, true, true, []);
  }

  const toggle = (id: string, open: boolean) => {
    hold(id);
    onOpen(id, open);
  };

  const uses = useMemo(() => usesOf(root), [root]);
  const [share, setShare] = useState<{
    readonly name: string;
    readonly provider: string | null;
  } | null>(null);
  const shared = useMemo(() => {
    if (!share || (share.provider !== null && !byId.has(share.provider)))
      return undefined;
    const users = usersOf(uses, share.name, share.provider);
    return { ...share, users, way: wayOf(root, share.provider, users) };
  }, [share, byId, uses, root]);
  const lit = shared?.way;
  useEffect(() => {
    if (!shared) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setShare(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shared]);
  const focusOf = (id: string): Part | undefined =>
    shared?.provider === id
      ? { kind: 'provides', name: shared.name }
      : shared?.users.includes(id)
        ? { kind: 'requires', name: shared.name }
        : undefined;
  const pick = (id: string, name: string, side: 'requires' | 'provides') => {
    const provider =
      side === 'provides'
        ? id
        : ((uses.get(id) ?? []).find((use) => use.name === name)?.from ?? null);
    if (shared && shared.name === name && shared.provider === provider)
      return setShare(null);
    setShare({ name, provider });
    const all = [
      ...(provider ? [provider] : []),
      ...usersOf(uses, name, provider),
    ];
    for (const one of all) if (!isOpen.has(one)) onOpen(one, true);
    hold(
      id,
      true,
      true,
      all.filter((one) => one !== id),
    );
  };
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
      if (touch && now < touch.until)
        held.current = { ...touch, until: now + HOLD };
      else
        held.current = { id, until: now + HOLD, center: false, reveal: false };
      return new Map(was).set(id, height);
    });
  }, []);
  const onChild = (parent: string, slot: string) => {
    const child = byId.get(parent)?.children.find((kid) => kid.name === slot);
    if (!child) return;
    setFolds((was) => new Map(was).set(parent, true));
    hold(parent);
    onOpen(child.id, !isOpen.has(child.id));
    setFlash((was) => ({ id: child.id, count: (was?.count ?? 0) + 1 }));
  };

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
        onContextMenu={(event) => {
          event.preventDefault();
          fit();
        }}
        className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{
          backgroundImage:
            'var(--inspector-dots, radial-gradient(circle, var(--color-border) 1px, transparent 1px))',
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
              const { change } = child.card;
              const shown =
                !lit || (lit.has(child.card.id) && lit.has(parent.card.id));
              return (
                <motion.path
                  key={child.card.id}
                  initial={false}
                  animate={{ d: pathOf(parent, child) }}
                  transition={drawn ? CARD_SPRING : { duration: 0 }}
                  fill="none"
                  strokeWidth={
                    change !== null || (shared && shown) ? 1.75 : 1.25
                  }
                  strokeLinecap="round"
                  strokeDasharray={
                    child.card.print.condition
                      ? DASH[child.card.print.condition]
                      : undefined
                  }
                  className={cn(
                    'transition-opacity duration-300 motion-reduce:transition-none',
                    !shown && 'opacity-20',
                    change === null
                      ? 'stroke-muted-foreground/40'
                      : change === 'started'
                        ? 'stroke-added/70'
                        : 'stroke-changed/60',
                  )}
                />
              );
            })}
          </svg>
          {placed.map((one) => {
            const focus = focusOf(one.card.id);
            return (
              <CardNode
                key={one.card.id}
                placed={one}
                body={bodies?.get(one.card.id)}
                still={!drawn}
                open={isOpen.has(one.card.id)}
                {...(focus ? { focus } : {})}
                dim={lit !== undefined && !lit.has(one.card.id)}
                folding={folding}
                {...(flash?.id === one.card.id ? { flash: flash.count } : {})}
                onOpen={toggle}
                onCenter={center}
                onFold={(id, open) => {
                  hold(id);
                  setFolds((was) => new Map(was).set(id, open));
                }}
                onChild={onChild}
                uses={uses.get(one.card.id) ?? NONE}
                onCapability={pick}
                onMeasure={onMeasure}
              />
            );
          })}
        </motion.div>
      </div>
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

const NONE: ReadonlyArray<Use> = [];
