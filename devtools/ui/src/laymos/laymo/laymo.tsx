import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

import {
  Files,
  PanelRightClose,
  PanelRightOpen,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';

import {
  aimCamera,
  CardFrame,
  HintLine,
  SidePanel,
  SpaceViewport,
  unionRect,
  useCardMotion,
  useSpace,
  ZoomControls,
  type Aim,
  type Placement,
  type Size,
} from '../canvas-space';
import { indexChanges, type ChangeIndex } from '../project-changes';
import {
  LaymoCard,
  laymoCardHeight,
  laymoCardWidth,
  lookOf,
  lookSurface,
  type Exposure,
} from './cards/laymo-card';
import {
  Edge,
  edgeColorVars,
  edgeStrokes,
  type EdgeTone,
} from './edges/edge-layer';
import { laymoLayers } from './layers';
import { FindingsStrip, findingsOf, type FindingCount } from './findings-strip';
import {
  endsOf,
  laymoLines,
  type LaymoEdge,
  rankEdgesOf,
  ruleEntriesOf,
  type LineFocus,
  type RuleEntry,
} from './laymo-edges';
import { layoutLaymo, type LaymoMap } from './laymo-layout';
import {
  buildLaymoTree,
  cardHolding,
  collapseAt,
  contains,
  isAncestor,
  openDownTo,
  pathTo,
  pruneLaymoTree,
  topPathOf,
  type LaymoNode,
  type LaymoTree,
} from './laymo-tree';
import { ModuleOutline } from './outline/module-outline';
import { RuleList } from './rule-list/rule-list';

export interface LaymoPanel {
  readonly label: string;
  readonly content: ReactNode;
  readonly onClose: () => void;
}

export interface LaymoProps {
  readonly analysis: ArchitectureAnalysis;
  readonly changes?: ChangeSet | undefined;
  /** Show only the cards the Change set touched, and the cards holding them. */
  readonly onlyChanged?: boolean | undefined;
  /** Show the Modules the Change set deleted where they stood. */
  readonly showDeleted?: boolean | undefined;
  /** A right-click on a card or an outline row: list the files beneath `path`. */
  readonly onOpenFiles: (path: string) => void;
  /** A panel shown over the dimmed space, as the File list is. */
  readonly panel?: LaymoPanel | undefined;
  /** A double-click on a card or an outline row: open what `path` is. */
  readonly onOpen?: ((path: string) => void) | undefined;
  /**
   * For a picture whose cards are not Modules, such as a Monorepo's
   * Packages: the change standings by card path, taking the place of
   * reading `changes` against the Module tree.
   */
  readonly changeIndex?: ChangeIndex | undefined;
  /** The counts at the bottom; a Project's findings when absent. */
  readonly findings?: readonly FindingCount[] | undefined;
  /** Whether the Rule list stands under the outline. */
  readonly showRules?: boolean | undefined;
  /** What the cards are, plural: the side panel's title. */
  readonly cardsNoun?: string | undefined;
  /** What the top card is called, in place of the Project. */
  readonly projectName?: string | undefined;
  /** Markers after a card's name, by the card's path. */
  readonly badgesOf?: ((path: string) => ReactNode) | undefined;
  /** The cards open from the start, beside the Project card. */
  readonly initiallyOpen?: readonly string[] | undefined;
  /** Grow cards to show whole names rather than cut them to one width. */
  readonly fitNames?: boolean | undefined;
  /** What the hint line says pointing and clicking do. */
  readonly hints?: readonly string[] | undefined;
  readonly className?: string | undefined;
}

const defaultHints = [
  'click to select',
  '› opens in place',
  'right-click for files',
];

/**
 * The Laymo: a Project's architecture as a space of cards, with the Module
 * outline and the Rule list beside it. The Project card holds its children,
 * ranked so that a card sits below the siblings that import it; a card opens
 * in place to show what it holds. At rest lines join siblings; a selected
 * card shows only what crosses its border, and pointing at a card inside it
 * narrows that to the card pointed at.
 */
export function Laymo(props: LaymoProps) {
  return <Canvas key={props.analysis.tree.root} {...props} />;
}

type Selection =
  | { readonly kind: 'card'; readonly key: string }
  | { readonly kind: 'rule'; readonly id: string };

// How long an opening keeps framing the card as its parts are measured.
const framingMs = 700;
const sideStorageKey = 'laymos.laymo.side-open';

function useSideOpen() {
  const [sideOpen, setSideOpen] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(sideStorageKey) !== 'false';
    } catch {
      return true;
    }
  });
  const change = useCallback((next: boolean) => {
    setSideOpen(next);
    try {
      globalThis.localStorage?.setItem(sideStorageKey, String(next));
    } catch {
      // A browser that keeps nothing still toggles for this visit.
    }
  }, []);
  return [sideOpen, change] as const;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((key) => right.has(key));
}

function Canvas({
  analysis: fullAnalysis,
  changes,
  onlyChanged = false,
  showDeleted = true,
  onOpenFiles,
  panel,
  onOpen,
  changeIndex: givenChangeIndex,
  findings: givenFindings,
  showRules = true,
  cardsNoun = 'Modules',
  projectName,
  badgesOf,
  initiallyOpen,
  fitNames = false,
  hints = defaultHints,
  className,
}: LaymoProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const changeIndex = useMemo(
    () =>
      givenChangeIndex ??
      (changes === undefined ? undefined : indexChanges(fullAnalysis, changes)),
    [givenChangeIndex, fullAnalysis, changes],
  );
  // With changes shown, the Modules they deleted stand where they were; with
  // only the changed asked for, the untouched cards leave the picture, and
  // the imports of what left with them.
  const { tree, analysis } = useMemo(() => {
    const whole = buildLaymoTree(
      fullAnalysis.tree,
      showDeleted ? changeIndex?.deletedModules : [],
    );
    if (!onlyChanged || changeIndex === undefined)
      return { tree: whole, analysis: fullAnalysis };
    const tree = pruneLaymoTree(
      whole,
      (card) => card.deleted || changeIndex.modules.has(topPathOf(card)),
    );
    const shown = (path: string) =>
      tree.byKey.has(cardHolding(whole, path).key);
    return {
      tree,
      analysis: {
        ...fullAnalysis,
        imports: fullAnalysis.imports.filter(
          ({ fromModule, toModule }) => shown(fromModule) && shown(toModule),
        ),
      },
    };
  }, [fullAnalysis, changeIndex, showDeleted, onlyChanged]);
  const rootKey = tree.root.key;
  // A card alone in the Project has nothing beside it to relate to: it
  // stays open and takes no selection, like the Project card itself.
  const loneKey =
    tree.root.children.length === 1 ? tree.root.children[0]!.key : undefined;
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () =>
      new Set([
        rootKey,
        ...(loneKey === undefined ? [] : [loneKey]),
        ...(initiallyOpen ?? []).filter((key) => tree.byKey.has(key)),
      ]),
  );
  useEffect(() => {
    if (loneKey !== undefined && !open.has(loneKey))
      setOpen(openDownTo(tree, loneKey, open));
  }, [loneKey, open, tree]);
  const [selection, setSelection] = useState<Selection>();
  const [hoverKey, setHoverKey] = useState<string>();
  // Leaving a card lets go a moment later, so moving from one card to the
  // next never flashes the whole space back on in between.
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  const point = useCallback((key: string, entering: boolean) => {
    clearTimeout(leaving.current);
    if (entering) {
      setHoverKey(key);
      return;
    }
    leaving.current = setTimeout(
      () => setHoverKey((current) => (current === key ? undefined : current)),
      140,
    );
  }, []);
  useEffect(() => () => clearTimeout(leaving.current), []);
  const [sideOpen, setSideOpen] = useSideOpen();
  const space = useSpace(reducedMotion, { wheel: 'zoom' });
  const cards = useCardMotion();

  const changeStatusOf = useCallback(
    (node: LaymoNode) => changeIndex?.modules.get(topPathOf(node)),
    [changeIndex],
  );
  const findings = useMemo(
    () => givenFindings ?? findingsOf(fullAnalysis),
    [givenFindings, fullAnalysis],
  );
  const entries = useMemo(() => ruleEntriesOf(fullAnalysis), [fullAnalysis]);
  // Inside a Wrapper the outside imports, whether it imports each card.
  const exposure = useMemo(() => {
    const byKey = new Map<string, Exposure>();
    for (const card of tree.byKey.values()) {
      const parent =
        card.parentKey === null ? undefined : tree.byKey.get(card.parentKey);
      if (parent === undefined || parent.parentKey === null || card.deleted)
        continue;
      // Exposure only says something where the outside imports the Wrapper.
      const reached = analysis.imports.some(
        ({ fromModule, toModule }) =>
          contains(topPathOf(parent), toModule) &&
          !contains(topPathOf(parent), fromModule),
      );
      if (!reached) continue;
      const exposed = analysis.imports.some(
        ({ fromModule, toModule }) =>
          contains(topPathOf(card), toModule) &&
          !contains(topPathOf(parent), fromModule),
      );
      byKey.set(card.key, exposed ? 'exposed' : 'internal');
    }
    return byKey;
  }, [tree, analysis.imports]);
  const edgesOf = useCallback(
    (node: LaymoNode) => rankEdgesOf(node, analysis),
    [analysis],
  );

  const sizes = useRef(new Map<string, Size>());
  const placed = useRef<LaymoMap | undefined>(undefined);
  const live = useRef({ tree, open, reducedMotion });
  live.current = { tree, open, reducedMotion };
  // The card last opened or collapsed stays where it is on screen while the
  // cards around it change size, and is framed through the measures after.
  const anchor = useRef<string | undefined>(undefined);
  const framing = useRef<{ key: string; until: number } | undefined>(undefined);
  const pending = useRef<{ placement: Placement; reveal?: readonly string[] }>({
    placement: 'jump',
  });
  const lastReveal = useRef<
    { keys: readonly string[]; at: number } | undefined
  >(undefined);

  const sizeOf = useCallback(
    (node: LaymoNode): Size => {
      const measured = sizes.current.get(node.key);
      return {
        width: fitNames ? (measured?.width ?? laymoCardWidth) : laymoCardWidth,
        height: measured?.height ?? laymoCardHeight,
      };
    },
    [fitNames],
  );

  const lay = useCallback(
    (tree: LaymoTree, open: ReadonlySet<string>) =>
      layoutLaymo(tree, open, sizeOf, edgesOf),
    [sizeOf, edgesOf],
  );
  const structure = useMemo(() => lay(tree, open), [tree, open, lay]);

  /**
   * Lays the cards out and aims the camera in one step, then plays both as
   * one FLIP, exactly as the Stories canvas does. Cards being revealed are
   * nudged into view, or fitted together when there are several.
   */
  const relayout = useCallback(
    (placement: Placement) => {
      const { tree, open, reducedMotion } = live.current;
      const previous = placed.current;
      const map = lay(tree, open);
      placed.current = map;
      const top = map.byKey.get(tree.root.key) ?? map.bounds;

      const recent = lastReveal.current;
      const revealKeys =
        pending.current.reveal ??
        (recent !== undefined && performance.now() - recent.at < framingMs
          ? recent.keys
          : undefined);
      if (pending.current.reveal !== undefined)
        lastReveal.current = {
          keys: pending.current.reveal,
          at: performance.now(),
        };
      pending.current.reveal = undefined;

      const framingKey =
        framing.current !== undefined &&
        framing.current.key === anchor.current &&
        performance.now() < framing.current.until
          ? framing.current.key
          : undefined;
      const view = space.view();
      const framed =
        framingKey === undefined ? undefined : map.byKey.get(framingKey);
      const revealed = (revealKeys ?? []).flatMap((key) => {
        const card = map.byKey.get(key);
        return card === undefined ? [] : [card];
      });
      const before = previous?.byKey.get(anchor.current ?? '');
      const after = map.byKey.get(anchor.current ?? '');
      // The card last opened or closed first stays where it was on screen;
      // then the camera moves only as far as showing it whole takes.
      const kept =
        before !== undefined && after !== undefined
          ? {
              ...view.goal,
              x: view.goal.x - (after.x - before.x) * view.goal.zoom,
              y: view.goal.y - (after.y - before.y) * view.goal.zoom,
            }
          : view.goal;
      const aim: Aim =
        framed !== undefined
          ? { kind: 'reveal', rect: framed }
          : revealed.length > 0
            ? { kind: 'reveal', rect: unionRect(revealed) }
            : !view.moved
              ? { kind: 'open', top }
              : { kind: 'stay' };
      const camera =
        view.viewport.width === 0
          ? view.goal
          : aimCamera(kept, aim, map.bounds, view.viewport);
      cards.place(
        map,
        previous,
        { from: view.camera, to: camera },
        placement,
        reducedMotion,
      );
      space.commit({
        camera,
        bounds: map.bounds,
        top,
        moved: aim.kind === 'reveal' || kept !== view.goal,
      });
    },
    [cards, lay, space],
  );

  useLayoutEffect(() => {
    relayout(pending.current.placement);
    pending.current.placement = 'glide';
  }, [tree, open, relayout]);

  const frame = useRef(0);
  const onMeasure = useCallback(
    (key: string, size: Size) => {
      const known = sizes.current.get(key);
      if (known?.width === size.width && known.height === size.height) return;
      sizes.current.set(key, size);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => relayout('glide'));
    },
    [relayout],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const onElement = useCallback(() => {}, []);

  /** Opens `next` and brings `keys` into view, laying out again if nothing opened. */
  const reveal = (keys: readonly string[], next: ReadonlySet<string>) => {
    anchor.current = keys[0];
    framing.current = undefined;
    pending.current.reveal = keys;
    if (sameSet(next, open)) relayout('glide');
    else setOpen(next);
  };

  const selectedKey = selection?.kind === 'card' ? selection.key : undefined;

  /**
   * A card pressed on the Laymo or in the outline selects it; the Project,
   * and a card alone in it, let go of the selection. A press in the outline
   * also brings the card into view, opening the cards above it.
   */
  const press = (key: string, from: 'laymo' | 'outline') => {
    if (key === rootKey || key === loneKey) {
      setSelection(undefined);
      return;
    }
    const card = tree.byKey.get(key);
    if (card === undefined) return;
    setSelection({ kind: 'card', key });
    if (from === 'outline')
      reveal(
        [key],
        card.parentKey === null ? open : openDownTo(tree, card.parentKey, open),
      );
  };

  /** Opens or closes a card in place, keeping it framed while it settles. */
  const toggle = (key: string) => {
    anchor.current = key;
    lastReveal.current = undefined;
    framing.current = { key, until: performance.now() + framingMs };
    setOpen(
      open.has(key) ? collapseAt(tree, key, open) : openDownTo(tree, key, open),
    );
  };

  /** Selects the card holding `path` and brings it into view, opening nothing else. */
  const select = (path: string) => {
    const card = cardHolding(tree, path);
    setSelection(
      card.key === rootKey ? undefined : { kind: 'card', key: card.key },
    );
    reveal(
      [card.key],
      card.parentKey === null ? open : openDownTo(tree, card.parentKey, open),
    );
  };

  /** Shows one Rule or Exception: both ends opened to, lit, and fitted on screen. */
  const choose = (entry: RuleEntry) => {
    if (selection?.kind === 'rule' && selection.id === entry.id) {
      setSelection(undefined);
      return;
    }
    setSelection({ kind: 'rule', id: entry.id });
    const ends = endsOf(analysis, entry).map((path) => cardHolding(tree, path));
    let next = open;
    for (const card of ends)
      if (card.parentKey !== null)
        next = openDownTo(tree, card.parentKey, next);
    reveal(
      ends.map((card) => card.key),
      next,
    );
  };

  const openFiles = (card: LaymoNode) => {
    // The Project, and a card alone in it, take no selection.
    if (card.key !== rootKey && card.key !== loneKey)
      setSelection({ kind: 'card', key: card.key });
    onOpenFiles(topPathOf(card));
  };

  // Escape closes the File list: the one key the Laymo keeps.
  const panelRef = useRef<HTMLElement>(null);
  const panelOpen = panel !== undefined;
  const closePanel = panel?.onClose;
  useEffect(() => {
    if (closePanel === undefined) return;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePanel]);

  // What the lines are about. A chosen Rule. Else the card pointed at
  // inside the selected one. Else the selected card, narrowed toward the
  // card pointed at when it is one of those it is lit with. Else, with
  // nothing selected, the card pointed at.
  const chosen =
    selection?.kind === 'rule'
      ? entries.find((entry) => entry.id === selection.id)
      : undefined;
  const pointedInside =
    selectedKey !== undefined &&
    hoverKey !== undefined &&
    isAncestor(tree, selectedKey, hoverKey)
      ? hoverKey
      : undefined;
  const focusKey =
    pointedInside ??
    selectedKey ??
    (selection === undefined ? hoverKey : undefined);
  const toward =
    pointedInside === undefined &&
    selectedKey !== undefined &&
    hoverKey !== selectedKey
      ? hoverKey
      : undefined;
  const lines = useMemo(() => {
    const focus: LineFocus =
      chosen !== undefined
        ? { kind: 'rule', entry: chosen }
        : focusKey !== undefined
          ? { kind: 'card', key: focusKey, toward }
          : undefined;
    return laymoLines(tree, open, analysis, focus);
  }, [chosen, focusKey, toward, tree, open, analysis]);
  const restLines = useMemo(
    () => laymoLines(tree, open, analysis, undefined),
    [tree, open, analysis],
  );
  // With nothing selected, the card pointed at reads as if it were.
  const lit = lines.lit;
  const dimming = lit !== undefined;
  // What is drawn, and how each line reads.
  const drawn = useMemo(() => {
    const toneOf = (edge: LaymoEdge): EdgeTone =>
      edge.emphasis !== 'lit'
        ? 'faded'
        : chosen !== undefined
          ? 'chosen'
          : edge.direction === 'in'
            ? 'used-by'
            : 'uses';
    if (lit === undefined)
      return restLines.edges.map((edge) => ({
        edge,
        tone: 'rest' as EdgeTone,
      }));
    return lines.edges.map((edge) => ({ edge, tone: toneOf(edge) }));
  }, [lines, restLines, lit, chosen]);
  // The cards holding a lit card stay clear: they are where it lives.
  const holdingLit = useMemo(() => {
    const holding = new Set<string>();
    for (const key of lit ?? [])
      for (const card of pathTo(tree, key).slice(0, -1)) holding.add(card.key);
    return holding;
  }, [lit, tree]);

  return (
    <div
      className={cn(
        'relative isolate flex min-h-0 overflow-clip bg-background',
        edgeColorVars,
        className,
      )}
    >
      <SpaceViewport
        space={space}
        inert={panelOpen}
        label={`Laymo of ${projectName ?? (tree.root.node.path === '.' ? 'the Project' : tree.root.node.path)}`}
        onGroundClick={() => setSelection(undefined)}
        // The ground stands for the whole Project, as its top card does.
        onGroundContextMenu={() => openFiles(tree.root)}
        overlay={
          <>
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-2">
              <div className="pointer-events-auto flex items-center gap-2">
                <ZoomControls space={space} />
                {!sideOpen && (
                  <button
                    type="button"
                    aria-label={`Show the ${cardsNoun} outline`}
                    title={`Show the ${cardsNoun} outline`}
                    onClick={() => setSideOpen(true)}
                    className="flex size-8 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-xs ring-1 ring-border backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <PanelRightOpen className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-3 max-sm:flex-col-reverse max-sm:items-start max-sm:gap-2">
              {/* A phone has no right-click: its File list opens from here. */}
              <button
                type="button"
                onClick={() =>
                  openFiles(tree.byKey.get(selectedKey ?? '') ?? tree.root)
                }
                className="pointer-events-auto flex h-9 min-w-0 shrink items-center gap-1.5 rounded-lg bg-background/90 px-3 text-xs font-medium shadow-xs ring-1 ring-border backdrop-blur-sm sm:hidden"
              >
                <Files className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">
                  {selectedKey === undefined
                    ? 'Files'
                    : `Files · ${tree.byKey.get(selectedKey)?.title ?? ''}`}
                </span>
              </button>
              {lit !== undefined && chosen === undefined ? (
                <Legend />
              ) : (
                <HintLine
                  moves={['Drag to move', 'scroll or pinch to zoom']}
                  hints={hints}
                  className="min-w-0 flex-1"
                />
              )}
              <FindingsStrip counts={findings} onReveal={select} />
            </div>
          </>
        }
      >
        {drawn.map(({ edge, tone }) => {
          const from = structure.byKey.get(edge.from);
          const to = structure.byKey.get(edge.to);
          if (from === undefined || to === undefined) return null;
          return (
            <Edge
              key={edge.id}
              edge={edge}
              from={cards.valuesOf(edge.from)}
              to={cards.valuesOf(edge.to)}
              tone={tone}
              depth={Math.max(from.depth, to.depth)}
            />
          );
        })}
        <AnimatePresence>
          {structure.cards.map((card) => {
            const node = card.node;
            const top = card.parentKey === null;
            const isLit = lit?.has(card.key) === true;
            const soft = lines.soft.has(card.key);
            const selected = selectedKey === card.key;
            const lone = card.key === loneKey;
            // A card pointed at with nothing selected reads as selected.
            const focused =
              selected || (selection === undefined && card.key === focusKey);
            const status = top
              ? undefined
              : node.deleted
                ? 'deleted'
                : changeStatusOf(node);
            const parent =
              card.parentKey === null
                ? undefined
                : tree.byKey.get(card.parentKey);
            return (
              <CardFrame
                key={card.key}
                cardKey={card.key}
                label={`${top ? 'Project' : node.node.path}${card.open ? ', open' : ''}`}
                values={cards.valuesOf(card.key)}
                parentValues={undefined}
                zIndex={laymoLayers.card(card.depth)}
                expanded={card.open}
                focused={false}
                dimmed={dimming && !isLit && !soft && !holdingLit.has(card.key)}
                surface={cn(
                  lookSurface({
                    look: lookOf(node),
                    open: card.open,
                    depth: card.depth,
                    top,
                    status,
                    selected: focused,
                  }),
                  !focused &&
                    status === undefined &&
                    card.key === focusKey &&
                    'ring-1 ring-foreground/75',
                  isLit &&
                    !focused &&
                    status === undefined &&
                    card.key !== focusKey &&
                    'ring-1 ring-foreground/40',
                  soft && 'opacity-60',
                  (top || lone) && 'cursor-default hover:shadow-none',
                )}
                onMeasure={onMeasure}
                onElement={onElement}
                onActivate={() => press(card.key, 'laymo')}
                onFocus={() => {}}
                onContextMenu={() => openFiles(node)}
                onDoubleClick={
                  onOpen === undefined || top
                    ? undefined
                    : () => onOpen(topPathOf(node))
                }
                onHover={(hovering) => {
                  if (!top && !lone) point(card.key, hovering);
                }}
              >
                <LaymoCard
                  card={node}
                  top={top}
                  open={card.open}
                  status={status}
                  exposure={exposure.get(card.key)}
                  wrapper={parent?.node.path}
                  name={top ? projectName : undefined}
                  badges={top ? undefined : badgesOf?.(topPathOf(node))}
                  fitName={fitNames}
                  onToggle={lone ? undefined : () => toggle(card.key)}
                />
              </CardFrame>
            );
          })}
        </AnimatePresence>
      </SpaceViewport>

      {sideOpen && (
        <aside
          inert={panelOpen}
          aria-label={`${cardsNoun} outline`}
          className="flex w-72 shrink-0 flex-col border-l border-border bg-background max-sm:hidden"
        >
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border ps-3 pe-1.5">
            <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {cardsNoun}
            </h3>
            <button
              type="button"
              aria-label={`Hide the ${cardsNoun} outline`}
              title="Hide"
              onClick={() => setSideOpen(false)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelRightClose className="size-4" />
            </button>
          </div>
          <div
            className={cn(
              'min-h-0 overflow-auto',
              showRules ? 'flex-[3]' : 'flex-1',
            )}
          >
            <ModuleOutline
              tree={tree}
              selectedKey={selectedKey}
              litKeys={lit}
              changeStatusOf={changeStatusOf}
              onPress={(key) => press(key, 'outline')}
              onOpenFiles={openFiles}
              onOpen={
                onOpen === undefined
                  ? undefined
                  : (card) => onOpen(topPathOf(card))
              }
              badgesOf={
                badgesOf === undefined
                  ? undefined
                  : (card) => badgesOf(topPathOf(card))
              }
              label={`${cardsNoun} outline`}
            />
          </div>
          {showRules && (
            <div className="min-h-0 flex-[2] overflow-auto border-t border-border">
              <RuleList
                entries={entries}
                selectedId={
                  selection?.kind === 'rule' ? selection.id : undefined
                }
                litIds={selectedKey === undefined ? undefined : lines.ruleIds}
                onChoose={choose}
              />
            </div>
          )}
        </aside>
      )}

      <SidePanel
        open={panelOpen}
        label={panel?.label ?? ''}
        panelRef={panelRef}
        reducedMotion={reducedMotion}
        widthKey="file-list.panel-width"
        onClose={() => panel?.onClose()}
      >
        {panel?.content}
      </SidePanel>
    </div>
  );
}

/** What the colours of a focused card's lines mean. */
function Legend() {
  const swatch = (color: string) => (
    <span
      aria-hidden
      className="h-0.5 w-4 rounded-full"
      style={{ background: color }}
    />
  );
  return (
    <p className="pointer-events-none flex min-w-0 flex-1 items-center text-[11px] text-muted-foreground max-sm:hidden">
      <span className="flex items-center gap-1.5 rounded-md bg-background/85 px-2 py-1 backdrop-blur-sm">
        {swatch(edgeStrokes.uses)} uses
        <span className="w-1.5" />
        {swatch(edgeStrokes['used-by'])} used by
        <span className="w-1.5" />
        {swatch(edgeStrokes.violation)} Violation
      </span>
    </p>
  );
}
