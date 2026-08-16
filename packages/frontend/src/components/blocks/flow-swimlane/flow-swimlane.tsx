import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { scrollbarStyles } from '#lib/scrollStyles';
import { FlowCanvas } from './flow-canvas';
import { FlowHeader } from './flow-header';
import { makeFlowLayout } from './layout';
import type { RecordedFlow } from './model';

type RecordedFlowItem = RecordedFlow['items'][number];
type RecordedFlowActivity = Extract<RecordedFlowItem, { kind: 'activity' }>;

interface FlowSwimlaneProps {
  readonly flow: RecordedFlow;
  readonly className?: string;
  readonly selectedItemId?: string | null;
  readonly onSelectionChange?: (item: RecordedFlowItem | null) => void;
  readonly onItemClick?: (item: RecordedFlowItem) => void;
  readonly onActivityClick?: (activity: RecordedFlowActivity) => void;
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
}: FlowSwimlaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
  const [collapsedSummaryIds, setCollapsedSummaryIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const activeSelectedId =
    selectedItemId === undefined ? uncontrolledSelectedId : selectedItemId;

  useEffect(() => {
    setUncontrolledSelectedId(null);
    setHiddenPaths(new Set());
    setHiddenParticipantNames(new Set());
    setCollapsedPaths(new Set());
    setCollapsedSummaryIds(new Set());
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
  const summaryIds = new Set(
    layout.items.flatMap((item) =>
      item.summaryId === undefined ? [] : [item.summaryId],
    ),
  );
  const allSummariesCollapsed =
    summaryIds.size > 0 &&
    [...summaryIds].every((summaryId) => collapsedSummaryIds.has(summaryId));
  const activeParticipantName =
    layout.items.find((item) =>
      item.members.some(({ id }) => id === activeSelectedId),
    )?.participantName ?? null;

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
    if (activeSelectedId === null || activeSelectedId === undefined) return;
    const center = layout.itemCenters.get(activeSelectedId);
    const container = containerRef.current;
    if (center === undefined || container === null) return;
    const headerHeight =
      container.querySelector<HTMLElement>('[data-flow-header]')
        ?.offsetHeight ?? 0;
    const availableHeight = Math.max(0, container.clientHeight - headerHeight);
    container.scrollTo({
      behavior: 'smooth',
      left: Math.max(0, center.x - container.clientWidth / 2),
      top: Math.max(0, center.y - availableHeight / 2),
    });
  }, [activeSelectedId, layout]);

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
    if (target !== undefined) select(target);
  };

  const toggleSelectedSummary = () => {
    if (activeSelectedId === null || activeSelectedId === undefined)
      return false;
    const selectedStep = layout.items.find((item) =>
      item.members.some(({ id }) => id === activeSelectedId),
    );
    if (selectedStep?.summaryId === undefined) return false;
    const collapsed = selectedStep.kind === 'summary';
    setCollapsedSummaryIds((current) =>
      changedSet(current, selectedStep.summaryId!, !collapsed),
    );
    select(
      flow.items.find(({ id }) => id === selectedStep.summaryId) ??
        selectedStep.members[0]!,
    );
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
    if (
      event.key === 'Enter' &&
      event.target === event.currentTarget &&
      toggleSelectedSummary()
    ) {
      event.preventDefault();
      event.stopPropagation();
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
      <div style={{ minWidth: '100%', width: layout.width }}>
        <FlowHeader
          activeParticipantName={activeParticipantName}
          allSummariesCollapsed={allSummariesCollapsed}
          hasSummaries={summaryIds.size > 0}
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
          onToggleAllSummaries={() =>
            setCollapsedSummaryIds(
              allSummariesCollapsed ? new Set() : summaryIds,
            )
          }
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
