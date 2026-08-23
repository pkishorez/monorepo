import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from 'react';

import { scrollbarStyles } from '#lib/scrollStyles';
import { FlowCanvas } from '../flow-canvas';
import { FlowHeader } from '../flow-header';
import { FlowItemDetails as FlowItemDetailsView } from '../flow-item-details';
import { makeFlowLayout, type RecordedFlow } from '../flow-presentation';

type RecordedFlowItem = RecordedFlow['items'][number];
type RecordedFlowActivity = Extract<RecordedFlowItem, { kind: 'activity' }>;

interface FlowSwimlaneProps {
  readonly flow: RecordedFlow;
  readonly className?: string;
  readonly selectedItemId?: string | null;
  readonly onSelectionChange?: (item: RecordedFlowItem | null) => void;
  readonly onItemClick?: (item: RecordedFlowItem) => void;
  readonly onActivityClick?: (activity: RecordedFlowActivity) => void;
  readonly scrollSelectionIntoView?: boolean;
  readonly collapsedSummaryIds?: ReadonlySet<string>;
  readonly onCollapsedSummaryIdsChange?: (ids: ReadonlySet<string>) => void;
}

const changedSet = (
  current: ReadonlySet<string>,
  value: string,
  include: boolean,
) => {
  const next = new Set(current);
  if (include) next.add(value);
  else next.delete(value);
  return next;
};

const ignoresFlowShortcuts = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.matches('button, input, select, textarea') ||
    target.isContentEditable);

/** Renders a canonical Recorded Flow as an interactive hierarchical swim lane. */
export function FlowSwimlane({
  flow,
  className,
  selectedItemId,
  onSelectionChange,
  onItemClick,
  onActivityClick,
  scrollSelectionIntoView = true,
  collapsedSummaryIds: controlledCollapsedSummaryIds,
  onCollapsedSummaryIdsChange,
}: FlowSwimlaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrolledSelectionRef = useRef<{
    readonly flowId: string;
    readonly itemId: string;
    readonly request: number;
    readonly summaryState: string;
  } | null>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  const [uncontrolledSelectedId, setUncontrolledSelectedId] = useState<
    string | null
  >(null);
  const [hiddenPaths, setHiddenPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [hiddenParticipantNames, setHiddenParticipantNames] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [uncontrolledCollapsedSummaryIds, setUncontrolledCollapsedSummaryIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const collapsedSummaryIds =
    controlledCollapsedSummaryIds ?? uncontrolledCollapsedSummaryIds;
  const collapsedSummaryState = [...collapsedSummaryIds].toSorted().join('\0');
  const activeSelectedId =
    selectedItemId === undefined ? uncontrolledSelectedId : selectedItemId;

  useEffect(() => {
    setUncontrolledSelectedId(null);
    setHiddenPaths(new Set());
    setHiddenParticipantNames(new Set());
    setCollapsedPaths(new Set());
    setUncontrolledCollapsedSummaryIds(new Set());
  }, [flow.id]);

  const layout = useMemo(
    () =>
      makeFlowLayout(flow, {
        collapsedPaths,
        collapsedSummaryIds,
        hiddenPaths,
        hiddenParticipantNames,
      }),
    [
      collapsedPaths,
      collapsedSummaryIds,
      flow,
      hiddenParticipantNames,
      hiddenPaths,
    ],
  );
  const activeParticipantNames = useMemo(() => {
    const step = layout.items.find((item) =>
      item.members.some(({ id }) => id === activeSelectedId),
    );
    if (step === undefined) return new Set<string>();
    return new Set(
      step.kind === 'message'
        ? [step.participantName, step.destination]
        : [step.participantName],
    );
  }, [layout.items, activeSelectedId]);

  const select = useCallback(
    (item: RecordedFlowItem | null) => {
      if (selectedItemId === undefined) {
        setUncontrolledSelectedId(item?.id ?? null);
      }
      onSelectionChange?.(item);
    },
    [onSelectionChange, selectedItemId],
  );

  const selectFromClick = useCallback(
    (item: RecordedFlowItem) => {
      select(activeSelectedId === item.id ? null : item);
      onItemClick?.(item);
    },
    [activeSelectedId, onItemClick, select],
  );

  const requestSelectionScroll = useCallback(() => {
    if (scrollSelectionIntoView) {
      setScrollRequest((current) => current + 1);
    }
  }, [scrollSelectionIntoView]);

  const changeCollapsedSummaryIds = useCallback(
    (next: ReadonlySet<string>) => {
      if (controlledCollapsedSummaryIds === undefined) {
        setUncontrolledCollapsedSummaryIds(next);
      }
      onCollapsedSummaryIdsChange?.(next);
    },
    [controlledCollapsedSummaryIds, onCollapsedSummaryIdsChange],
  );

  useEffect(() => {
    if (
      activeSelectedId === null ||
      activeSelectedId === undefined ||
      layout.rowByItemId.has(activeSelectedId)
    ) {
      return;
    }

    const chronological = flow.items.toSorted(
      (left, right) => left.timestamp - right.timestamp,
    );
    const selectedIndex = chronological.findIndex(
      ({ id }) => id === activeSelectedId,
    );
    const visibleIds = new Set(
      layout.items.flatMap((item) => item.members.map(({ id }) => id)),
    );
    const next = chronological.find(
      (item, index) => index > selectedIndex && visibleIds.has(item.id),
    );
    const previous = chronological.findLast(
      (item, index) => index < selectedIndex && visibleIds.has(item.id),
    );
    select(next ?? previous ?? null);
  }, [activeSelectedId, flow.items, layout.items, layout.rowByItemId, select]);

  useLayoutEffect(() => {
    if (!scrollSelectionIntoView) {
      lastScrolledSelectionRef.current = null;
      return;
    }
    if (activeSelectedId === null || activeSelectedId === undefined) {
      lastScrolledSelectionRef.current = null;
      return;
    }
    const lastScrolled = lastScrolledSelectionRef.current;
    if (
      lastScrolled?.flowId === flow.id &&
      lastScrolled.itemId === activeSelectedId &&
      lastScrolled.request === scrollRequest &&
      lastScrolled.summaryState === collapsedSummaryState
    ) {
      return;
    }
    const center = layout.itemCenters.get(activeSelectedId);
    const container = containerRef.current;
    if (center === undefined || container === null) return;
    lastScrolledSelectionRef.current = {
      flowId: flow.id,
      itemId: activeSelectedId,
      request: scrollRequest,
      summaryState: collapsedSummaryState,
    };
    const headerHeight =
      container.querySelector<HTMLElement>('[data-flow-header]')
        ?.offsetHeight ?? 0;
    const availableHeight = Math.max(0, container.clientHeight - headerHeight);
    container.scrollTo({
      behavior: 'smooth',
      left: Math.max(0, center.x - container.clientWidth / 2),
      top: Math.max(0, center.y - availableHeight / 2),
    });
  }, [
    activeSelectedId,
    collapsedSummaryState,
    flow.id,
    layout.itemCenters,
    scrollRequest,
    scrollSelectionIntoView,
  ]);

  const navigate = (direction: -1 | 1) => {
    const currentIndex =
      activeSelectedId === null || activeSelectedId === undefined
        ? -1
        : layout.items.findIndex((item) =>
            item.members.some(({ id }) => id === activeSelectedId),
          );
    const targetIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : layout.items.length - 1
        : currentIndex + direction;
    const target = layout.items[targetIndex]?.members[0];
    if (target !== undefined) {
      // Reclaim focus so a previously clicked row can't swallow Enter later.
      containerRef.current?.focus();
      select(target);
      requestSelectionScroll();
    }
  };

  const toggleSelectedSummary = () => {
    if (activeSelectedId === null || activeSelectedId === undefined)
      return false;
    const selectedStep = layout.items.find((item) =>
      item.members.some(({ id }) => id === activeSelectedId),
    );
    if (selectedStep?.summaryId === undefined) return false;
    const collapsed = collapsedSummaryIds.has(selectedStep.summaryId);
    changeCollapsedSummaryIds(
      changedSet(collapsedSummaryIds, selectedStep.summaryId, !collapsed),
    );
    requestSelectionScroll();
    return true;
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (ignoresFlowShortcuts(event.target)) return;
    if (event.key === 'j' || event.key === 'J' || event.key === 'ArrowDown') {
      event.preventDefault();
      navigate(1);
      return;
    }
    if (event.key === 'k' || event.key === 'K' || event.key === 'ArrowUp') {
      event.preventDefault();
      navigate(-1);
      return;
    }
    if (event.key === 'Enter') {
      if (toggleSelectedSummary()) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-auto outline-none ${scrollbarStyles} ${className ?? ''}`}
      data-flow-id={flow.id}
      tabIndex={0}
      onKeyDownCapture={onKeyDownCapture}
    >
      <div
        className="mx-auto"
        style={{ width: Math.max(layout.width, 0), minWidth: 'min-content' }}
      >
        <FlowHeader
          activeParticipantNames={activeParticipantNames}
          layout={layout}
          onHideParticipant={(participantName) =>
            setHiddenParticipantNames((current) =>
              changedSet(current, participantName, true),
            )
          }
          onHideSubtree={(path) =>
            setHiddenPaths((current) => changedSet(current, path, true))
          }
          onRestore={(path, marker) => {
            if (marker === 'participant') {
              setHiddenParticipantNames((current) =>
                changedSet(current, path, false),
              );
            } else if (marker === 'hidden') {
              setHiddenPaths((current) => changedSet(current, path, false));
            } else {
              setCollapsedPaths((current) => changedSet(current, path, false));
            }
          }}
          onToggleCollapse={(path) =>
            setCollapsedPaths((current) =>
              changedSet(current, path, !current.has(path)),
            )
          }
        />
        <FlowCanvas
          flowId={flow.id}
          layout={layout}
          selectedItemId={activeSelectedId}
          onItemClick={selectFromClick}
          onActivityClick={onActivityClick}
        />
      </div>
    </div>
  );
}

/** Presents one selected item through the stable Flow Swimlane facade. */
export function FlowItemDetails(
  props: ComponentProps<typeof FlowItemDetailsView>,
) {
  return <FlowItemDetailsView {...props} />;
}

/** Finds the stable IDs used by consecutive-step collapse controls. */
export function getFlowSummaryIds(flow: RecordedFlow): ReadonlySet<string> {
  return new Set(
    makeFlowLayout(flow).items.flatMap((item) =>
      item.summaryId === undefined ? [] : [item.summaryId],
    ),
  );
}
