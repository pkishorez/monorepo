import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import type { ProofReport, StoryNode, StoryTree } from 'laymos/story/schema';

import { Play, ShieldAlert } from '@kstackz/web-platform/components/lucide';
import { Button } from '@kstackz/web-platform/components/button';
import { cn } from '@kstackz/web-platform/components/utils';

import {
  aimCamera,
  CardFrame,
  HintLine,
  SidePanel,
  SpaceViewport,
  useCardMotion,
  useSpace,
  walkFocus,
  ZoomControls,
  type Aim,
  type Placement,
  type Size,
  type Walk,
} from '../canvas-space';
import { CanvasContext, type CanvasState } from './canvas-context';
import { StoryCard, storyCardWidth } from './cards/story-card';
import { countBadge } from './cards/run-motion';
import { TallyLine } from './cards/tally';
import {
  familyRect,
  layoutMindMap,
  type MindMap,
  type PlacedCard,
} from './mind-map/mind-map-layout';
import { ProofPanel } from './proof-panel/proof-panel';
import {
  enterDoes,
  keepsKeys,
  keyLabel,
  panelSurface,
  spaceRuns,
  storiesKeys,
  useActiveElement,
  type SpaceFocus,
} from './stories-keys';
import {
  finishedOf,
  isUnderway,
  observeRun,
  progressOf,
  runDisplay,
  settleRun,
  startRun,
  type Run,
} from './run-progress';
import {
  closeAt,
  findProof,
  indexTree,
  inScope,
  proofsBeneath,
  proofState,
  openPath,
  storyPath,
  tallyOf,
} from './story-scope';

export interface StoriesCanvasProps {
  readonly tree: StoryTree;
  /** The latest Proof report per Proof id. */
  readonly reports: Readonly<Record<string, ProofReport>>;
  /** Proof ids started and not yet finished. */
  readonly running: ReadonlySet<string>;
  /**
   * Runs a Story id or Proof id and everything beneath it; everything when
   * `scope` is undefined. A promise it returns settles when that run ends,
   * finished, failed or interrupted; without one, a run ends once nothing
   * of it runs.
   */
  readonly onRun: (scope?: string) => PromiseLike<unknown> | void;
  /** Where an Evidence file of a Proof's report is served. */
  readonly evidenceUrl: (proofId: string, file: string) => string;
  readonly className?: string;
}

/**
 * The Stories canvas: the Story tree as a space to explore. The top Story
 * comes first; opening a Story shows its Telling in place with its
 * sub-Stories to its right and its own Proofs listed beneath it, and opening
 * a Proof shows its whole Proof report beside the space.
 */
export function StoriesCanvas(props: StoriesCanvasProps) {
  return <Keyboard key={props.tree.id} {...props} />;
}

type Surface = Parameters<typeof storiesKeys.Provider>[0]['surface'];

function Keyboard(props: StoriesCanvasProps) {
  const [surface, setSurface] = useState<Surface>('stories');
  return (
    <storiesKeys.Provider surface={surface} onSurfaceChange={setSurface}>
      <Canvas {...props} />
    </storiesKeys.Provider>
  );
}

// Before a card has been measured.
const guessedHeight = 130;
/** Room kept on each side of a card, in screen px, when the screen is narrow. */
const cardMarginOf = (width: number) => (width < 640 ? 20 : 24);

// How long a Proof list folds or unfolds: meanwhile the cards follow its
// height frame by frame instead of gliding after it.
const foldMs = 320;

function Canvas({
  tree,
  reports: latestReports,
  running,
  onRun,
  evidenceUrl,
  className,
}: StoriesCanvasProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const index = useMemo(() => indexTree(tree), [tree]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  // Open Stories whose Proof list the reader folded away; lists show by default.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState(tree.id);
  const [shownProof, setShownProof] = useState<string>();
  const [criticalOnly, setCriticalOnly] = useState(false);
  const space = useSpace(reducedMotion);
  // The run's scope is fixed when it begins; the running Proofs and new
  // reports then tell which of it have started and finished.
  const [run, setRun] = useState<Run>();
  const [seen, setSeen] = useState({ running, reports: latestReports });
  if (seen.running !== running || seen.reports !== latestReports) {
    setSeen({ running, reports: latestReports });
    setRun((current) => observeRun(current, running, latestReports));
  }
  const finished = useMemo(
    () => finishedOf(run, running, latestReports),
    [run, running, latestReports],
  );
  // While a run is under way its Proofs show no earlier verdict.
  const { reports, pending: waiting } = useMemo(
    () => runDisplay(run, running, latestReports),
    [run, running, latestReports],
  );
  const latest = useRef({ running, reports: latestReports });
  latest.current = { running, reports: latestReports };
  /** Runs `scope`, unless some of it is running or waiting already. */
  const runScope = (scope?: string) => {
    const proofs = proofsBeneath(tree).filter((proof) =>
      inScope(proof.id, scope),
    );
    if (isUnderway(proofs, run, running, latestReports)) return;
    const ending = onRun(scope);
    const signalled = ending != null;
    setRun((current) =>
      startRun(
        current,
        proofs.map((proof) => proof.id),
        latestReports,
        signalled,
      ),
    );
    const settle = () =>
      setRun((current) =>
        settleRun(current, latest.current.running, latest.current.reports),
      );
    ending?.then(settle, settle);
  };
  const cards = useCardMotion();
  const { openSurface, closeSurface } = storiesKeys.useSurface();
  const hints = storiesKeys
    .useStatus()
    .actions.filter((action) => /^stories\.[^.]+$/.test(action.id))
    .map(
      (action) =>
        `${action.bindings.map(({ binding }) => keyLabel(binding)).join(' ')} ${action.description}`,
    );

  const sizes = useRef(new Map<string, Size>());
  const elements = useRef(new Map<string, HTMLElement>());
  const placed = useRef<MindMap | undefined>(undefined);
  const live = useRef({ tree, open, reducedMotion });
  live.current = { tree, open, reducedMotion };
  // The card last opened, collapsed or followed to stays where it is on
  // screen while cards around it change size.
  const anchor = useRef<string | undefined>(undefined);
  const pending = useRef<{ placement: Placement; reveal?: string }>({
    placement: 'jump',
  });
  const lastReveal = useRef<{ key: string; at: number } | undefined>(undefined);
  // A Story just opened or collapsed glides into frame with its sub-Stories,
  // through the cards measured after.
  const framing = useRef<{ key: string; until: number } | undefined>(undefined);
  const foldingUntil = useRef(0);

  // No card is wider on screen than the space, less a margin on each side.
  const [maxWidth, setMaxWidth] = useState<number>(storyCardWidth.open);
  const lastMaxWidth = useRef<number>(storyCardWidth.open);
  useEffect(() => {
    const update = () => {
      const width = space.width.get();
      if (width === 0) return;
      const next = Math.min(
        storyCardWidth.open,
        Math.floor((width - cardMarginOf(width) * 2) / space.zoom.get()),
      );
      if (next === lastMaxWidth.current) return;
      lastMaxWidth.current = next;
      // Reflowing for the screen or zoom moves the cards at once.
      pending.current.placement = 'jump';
      setMaxWidth(next);
    };
    update();
    const stopWidth = space.width.on('change', update);
    const stopZoom = space.zoom.on('change', update);
    return () => {
      stopWidth();
      stopZoom();
    };
  }, [space.width, space.zoom]);

  const lay = useCallback(
    (tree: StoryNode, open: ReadonlySet<string>, maxWidth: number) =>
      layoutMindMap(
        tree,
        open,
        (story) => ({
          width: open.has(story.id)
            ? storyCardWidth.open
            : storyCardWidth.closed,
          height: sizes.current.get(story.id)?.height ?? guessedHeight,
        }),
        undefined,
        maxWidth,
      ),
    [],
  );

  // Which cards show, parents first; where they go is placed below.
  const structure = useMemo(
    () => lay(tree, open, maxWidth),
    [tree, open, maxWidth, lay],
  );

  /**
   * Lays the cards out and aims the camera in one step, then plays both as
   * one FLIP: the camera is put straight at its final place and every card
   * moves from where it was on screen to where it now is.
   */
  const relayout = useCallback(
    (placement: Placement, nudge?: string) => {
      const { tree, open, reducedMotion } = live.current;
      const previous = placed.current;
      const map = lay(tree, open, lastMaxWidth.current);
      placed.current = map;
      const top = map.byKey.get(tree.id) ?? map.bounds;

      // Cards measured just after an opening still count towards its reveal.
      const recent = lastReveal.current;
      const revealKey =
        pending.current.reveal ??
        (recent !== undefined && performance.now() - recent.at < 700
          ? recent.key
          : undefined);
      if (pending.current.reveal !== undefined)
        lastReveal.current = {
          key: pending.current.reveal,
          at: performance.now(),
        };
      pending.current.reveal = undefined;

      // A focus move only nudges; it never reframes an opening still settling.
      const framingKey =
        nudge === undefined &&
        framing.current !== undefined &&
        framing.current.key === anchor.current &&
        performance.now() < framing.current.until
          ? framing.current.key
          : undefined;
      const view = space.view();
      // A card with its sub-Stories too wide for the screen, as on a phone,
      // is framed alone: its sub-Stories wait to its right.
      const family =
        framingKey === undefined ? undefined : familyRect(map, framingKey);
      const roomy =
        family !== undefined &&
        family.width * view.goal.zoom <=
          view.viewport.width - cardMarginOf(view.viewport.width) * 2;
      const framed =
        framingKey === undefined
          ? undefined
          : roomy
            ? family
            : map.byKey.get(framingKey);
      const nudged = map.byKey.get(nudge ?? revealKey ?? '');
      const before = previous?.byKey.get(anchor.current ?? '');
      const after = map.byKey.get(anchor.current ?? '');
      const aim: Aim =
        framed !== undefined
          ? { kind: 'frame', rect: framed }
          : nudged !== undefined
            ? { kind: 'nudge', rect: nudged }
            : !view.moved
              ? { kind: 'open', top }
              : before !== undefined && after !== undefined
                ? {
                    kind: 'keep',
                    by: { x: after.x - before.x, y: after.y - before.y },
                  }
                : { kind: 'stay' };
      const camera =
        view.viewport.width === 0
          ? view.goal
          : aimCamera(view.goal, aim, map.bounds, view.viewport);
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
        moved: aim.kind !== 'open' && aim.kind !== 'stay',
      });
    },
    [cards, lay, space],
  );

  useLayoutEffect(() => {
    relayout(pending.current.placement);
    pending.current.placement = 'glide';
  }, [tree, open, maxWidth, relayout]);

  const frame = useRef(0);
  const onMeasure = useCallback(
    (key: string, size: Size) => {
      const known = sizes.current.get(key);
      if (known?.width === size.width && known.height === size.height) return;
      sizes.current.set(key, size);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() =>
        relayout(performance.now() < foldingUntil.current ? 'jump' : 'glide'),
      );
    },
    [relayout],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onElement = useCallback((key: string, element: HTMLElement | null) => {
    if (element === null) elements.current.delete(key);
    else elements.current.set(key, element);
  }, []);

  /** Opens exactly `next`; a closing card's Proof list shows again next time. */
  const openOnly = useCallback((next: ReadonlySet<string>) => {
    setOpen(next);
    setFolded((current) => {
      const kept = new Set([...current].filter((id) => next.has(id)));
      return kept.size === current.size ? current : kept;
    });
  }, []);

  /** Opens the path down to `id`, and brings `id` into view. */
  const openDownTo = useCallback(
    (id: string) => {
      anchor.current = id;
      framing.current = undefined;
      pending.current.reveal = id;
      const next = openPath(tree, id);
      openOnly(next);
      // Opening nothing new still brings the card into view.
      if (next.size === open.size && [...next].every((key) => open.has(key)))
        relayout('glide');
    },
    [tree, open, openOnly, relayout],
  );

  const showStory = useCallback(
    (id: string) => {
      if (storyPath(tree, id) === undefined) return;
      openDownTo(id);
      setFocusKey(id);
    },
    [tree, openDownTo],
  );

  const showProof = useCallback(
    (id: string) => {
      const found = findProof(tree, id);
      if (found === undefined) return;
      const story = found.path.at(-1)!.id;
      openDownTo(story);
      setFolded((current) =>
        current.has(story)
          ? new Set([...current].filter((key) => key !== story))
          : current,
      );
      setFocusKey(story);
      setShownProof(id);
      openSurface(panelSurface);
    },
    [tree, openDownTo, openSurface],
  );

  /** Opens or collapses `card`, framing it with its sub-Stories, and focuses `focus`. */
  const activate = (card: PlacedCard, focus = card.key) => {
    setFocusKey(focus);
    const id = card.key;
    const opening = !open.has(id);
    anchor.current = card.key;
    lastReveal.current = undefined;
    framing.current = { key: card.key, until: performance.now() + 700 };
    openOnly(opening ? openPath(tree, id) : closeAt(tree, id));
  };

  const fold = (card: PlacedCard) => {
    setFocusKey(card.key);
    anchor.current = card.key;
    lastReveal.current = undefined;
    framing.current = undefined;
    foldingUntil.current = performance.now() + (reducedMotion ? 0 : foldMs);
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(card.key)) next.delete(card.key);
      else next.add(card.key);
      return next;
    });
  };

  /** Walks focus from the focused card, opening it first when it must. */
  const walk = (action: Walk) => {
    const map = placed.current;
    const card = map?.byKey.get(focusKey);
    if (map === undefined || card === undefined) return;
    const step = walkFocus(
      map,
      focusKey,
      action,
      (card) => card.story.stories[0]?.id,
    );
    if (step === undefined) return;
    if (step.kind === 'toggle') {
      activate(card, step.focus);
      return;
    }
    setFocusKey(step.key);
    relayout('glide', step.key);
  };
  // A button or link in the canvas keeps Enter and Space for its own click;
  // a focused Proof row takes them from its card.
  const rootRef = useRef<HTMLDivElement>(null);
  const active = useActiveElement();
  const spaceFocus: SpaceFocus = {
    card: focusKey,
    proof: active?.closest<HTMLElement>('[data-proof]')?.dataset.proof,
    control: keepsKeys(active, rootRef.current),
  };
  storiesKeys.useAction('stories.parent', () => walk('parent'));
  storiesKeys.useAction('stories.firstChild', () => walk('firstChild'));
  storiesKeys.useAction('stories.nextSibling', () => walk('nextSibling'));
  storiesKeys.useAction('stories.previousSibling', () =>
    walk('previousSibling'),
  );
  const enter = enterDoes(spaceFocus);
  storiesKeys.useAction(
    'stories.toggle',
    () => {
      if (enter?.kind === 'proof') {
        showProofPanel(enter.key);
        return;
      }
      const card = placed.current?.byKey.get(focusKey);
      if (card !== undefined) activate(card);
    },
    { enabled: enter !== undefined },
  );
  const runs = spaceRuns(spaceFocus);
  storiesKeys.useAction('stories.run', () => runScope(runs));

  const showProofPanel = useCallback(
    (id: string) => {
      const story = findProof(tree, id)?.path.at(-1)?.id;
      if (story !== undefined) setFocusKey(story);
      setShownProof(id);
      openSurface(panelSurface);
    },
    [tree, openSurface],
  );

  const closePanel = () => {
    setShownProof(undefined);
    closeSurface(panelSurface);
  };
  storiesKeys.useAction('stories.proof-panel.close', closePanel);

  // The focused card holds the keys: focus follows it when the keys were on
  // a card or nowhere, and comes back to it when the Proof panel closes.
  const panelRef = useRef<HTMLElement>(null);
  const panelOpen = shownProof !== undefined;
  const wasOpen = useRef(false);
  const claimed = useRef(false);
  useEffect(() => {
    // Opening the canvas puts the keys on its card, unless a text field has
    // them: a click on the stories tab would otherwise keep Space for the tab.
    const claiming = !claimed.current;
    const closing = wasOpen.current && !panelOpen;
    wasOpen.current = panelOpen;
    if (panelOpen) {
      panelRef.current?.focus({ preventScroll: true });
      return;
    }
    const card = elements.current.get(focusKey);
    const active = document.activeElement;
    if (card === undefined) return;
    claimed.current = true;
    if (active === card) return;
    const onCard = [...elements.current.values()].some((element) =>
      element.contains(active),
    );
    const typing = active?.closest(
      'input, textarea, select, [contenteditable]',
    );
    if (
      closing ||
      onCard ||
      active === null ||
      active === document.body ||
      (claiming && typing == null)
    )
      card.focus({ preventScroll: true });
  }, [focusKey, panelOpen, structure]);

  const canvasState: CanvasState = {
    reports,
    running,
    pending: waiting,
    run,
    finished,
    index,
    criticalOnly,
    reducedMotion,
    shownProof,
    onRun: (scope) => runScope(scope),
    onStoryLink: showStory,
    onProofLink: showProof,
    onShowProof: showProofPanel,
  };

  const rootTally = tallyOf(tree, reports, running, waiting);
  const rootProgress = progressOf(
    proofsBeneath(tree),
    run?.scope ?? new Set(),
    finished,
  );
  const criticalCount = proofsBeneath(tree).filter(
    (proof) => proof.critical,
  ).length;
  const opened =
    shownProof === undefined ? undefined : findProof(tree, shownProof);
  return (
    <div
      ref={rootRef}
      className={cn(
        'relative isolate flex min-h-0 overflow-clip bg-background',
        className,
      )}
    >
      <CanvasContext.Provider value={canvasState}>
        <SpaceViewport
          space={space}
          inert={opened !== undefined}
          label={`Stories of ${tree.title}`}
          overlay={
            <>
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
                <div className="pointer-events-auto flex h-8 items-center gap-3 rounded-lg bg-background/90 px-3 shadow-xs ring-1 ring-border backdrop-blur-sm">
                  <span className="text-xs font-medium">
                    {rootTally.total}{' '}
                    {rootTally.total === 1 ? 'Proof' : 'Proofs'}
                  </span>
                  <TallyLine tally={rootTally} />
                </div>
                <div className="pointer-events-auto flex items-center gap-2">
                  {criticalCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-pressed={criticalOnly}
                      onClick={() => setCriticalOnly(!criticalOnly)}
                      className={cn(
                        'bg-background/90 backdrop-blur-sm',
                        criticalOnly &&
                          'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:hover:bg-foreground/90',
                      )}
                    >
                      <ShieldAlert className="size-3.5" />
                      Critical
                      <span className="tabular-nums opacity-70">
                        {criticalCount}
                      </span>
                    </Button>
                  )}
                  <ZoomControls space={space} />
                  <Button
                    size="sm"
                    onClick={() => runScope()}
                    disabled={run?.active === true}
                    className="disabled:opacity-100"
                  >
                    <Play className="size-3.5" />
                    {run?.active === true ? (
                      <>
                        Running
                        <span
                          className={cn(
                            countBadge,
                            'bg-primary-foreground/18 text-primary-foreground',
                          )}
                        >
                          {rootProgress.done} / {rootProgress.total}
                        </span>
                      </>
                    ) : (
                      'Run all'
                    )}
                  </Button>
                </div>
              </div>
              <HintLine hints={hints} />
            </>
          }
        >
          <AnimatePresence>
            {structure.cards.map((card) => {
              const values = cards.valuesOf(card.key);
              const parentValues =
                card.parentKey === null
                  ? undefined
                  : cards.valuesOf(card.parentKey);
              const story = card.story;
              const isOpen = open.has(story.id);
              return (
                <CardFrame
                  key={card.key}
                  cardKey={card.key}
                  label={story.title}
                  values={values}
                  parentValues={parentValues}
                  zIndex={100 - card.depth}
                  expanded={isOpen}
                  focused={focusKey === card.key}
                  dimmed={
                    criticalOnly &&
                    !proofsBeneath(story).some((proof) => proof.critical)
                  }
                  surface={
                    tallyOf(story, reports, running, waiting).criticalFailing
                      ? 'ring-destructive/45'
                      : 'ring-border'
                  }
                  onMeasure={onMeasure}
                  onElement={onElement}
                  onActivate={() => activate(card)}
                  onFocus={() => setFocusKey(card.key)}
                >
                  <StoryCard
                    story={story}
                    open={isOpen}
                    width={card.width}
                    top={card.parentKey === null}
                    unfolded={!folded.has(story.id)}
                    tabbable={isOpen && focusKey === card.key}
                    onFold={() => fold(card)}
                  />
                </CardFrame>
              );
            })}
          </AnimatePresence>
        </SpaceViewport>

        <SidePanel
          open={opened !== undefined}
          label={opened?.proof.title ?? ''}
          panelRef={panelRef}
          reducedMotion={reducedMotion}
          onClose={closePanel}
        >
          {opened !== undefined && (
            <ProofPanel
              key={opened.proof.id}
              proof={opened.proof}
              path={opened.path}
              report={latestReports[opened.proof.id]}
              state={proofState(opened.proof.id, reports, running, waiting)}
              onRun={() => runScope(opened.proof.id)}
              onClose={closePanel}
              onStory={(id) => {
                closePanel();
                showStory(id);
              }}
              evidenceUrl={evidenceUrl}
            />
          )}
        </SidePanel>
      </CanvasContext.Provider>
    </div>
  );
}
