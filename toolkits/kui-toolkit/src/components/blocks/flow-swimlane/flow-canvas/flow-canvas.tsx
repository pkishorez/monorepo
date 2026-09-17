import { useId, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from '#lib/motion';
import {
  flowCanvasTopPadding,
  flowRowGap,
  type FlowLayout,
  type RecordedFlow,
} from '../flow-presentation';

type RecordedFlowItem = RecordedFlow['items'][number];
type RecordedFlowSeverity = RecordedFlowItem['severity'];

const checkWidth = 196;
const itemHeight = 40;
const localEventWidth = 170;
const markerWidth = 196;
const summaryHeight = 58;
const summaryWidth = 196;
const messageHeight = 28;
const messageMaxWidth = 208;

// Line guidelines, kept deliberately small:
//
// - Thin solid line: the Participant's lifeline. It exists; nothing is running.
// - Wide solid line: an Activation is in place. `primary` while it is still
//   open, grey once it ended, `destructive` when it failed.
// - Wide dotted line: the Activation is waiting (Wait until Resume, or to the
//   bottom while the Wait is open). Same colour as its rail.
// - Dimming: only a lifeline that never recorded anything. Nothing fades or
//   stripes; an open Activation simply runs to the bottom at full strength.
//
// Two colours only: `primary` marks what is running or selected, `destructive`
// marks what went wrong. Everything else is shape and grey.
const neutral = 'var(--color-muted-foreground)';
const failure = 'var(--color-destructive)';
const emphasis = 'var(--color-primary)';

const eventColor: Record<RecordedFlowSeverity, string> = {
  debug: neutral,
  error: failure,
  info: 'var(--color-foreground)',
  warning: 'var(--color-foreground)',
};

const checkColor = (passed: boolean) => (passed ? neutral : failure);
const messageColor = 'var(--color-foreground)';

type ActivationOutcome = RecordedFlow['activations'][number]['outcome'];

const activationColor: Record<NonNullable<ActivationOutcome>, string> = {
  completed: neutral,
  failed: failure,
  interrupted: neutral,
};

const markerWord: Record<string, string> = {
  'activation-start': 'Start',
  'activation-end': 'End',
  wait: 'Wait',
  resume: 'Resume',
  close: 'Closed',
};

const railWidth = 9;
const railTrackGap = 12;
const openRailColor = emphasis;

const formatDuration = (milliseconds: number) => {
  if (milliseconds < 0.001) return `${Math.round(milliseconds * 1_000_000)} ns`;
  if (milliseconds < 1) return `${Math.round(milliseconds * 1_000)} µs`;
  if (milliseconds < 1_000) return `${milliseconds.toFixed(2)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
};

export function FlowCanvas({
  flowId,
  layout,
  selectedItemId,
  onItemClick,
}: {
  readonly flowId: string;
  readonly layout: FlowLayout;
  readonly selectedItemId?: string | null | undefined;
  readonly onItemClick?: ((item: RecordedFlowItem) => void) | undefined;
}) {
  const markerId = useId().replaceAll(':', '');
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const {
    activations,
    height,
    items,
    laneEndY,
    laneX,
    participants,
    replyLatency,
    silentParticipants,
    waits,
    width,
  } = layout;

  /** The card rectangle of one step, used for the selection ring and warning badges. */
  const stepBounds = (
    selectedStep: (typeof items)[number],
    selectedStepIndex: number,
  ) => {
    const y =
      flowCanvasTopPadding + selectedStepIndex * flowRowGap + flowRowGap / 2;
    const x = laneX.get(selectedStep.participantName)!;
    if (selectedStep.kind === 'message') {
      const destinationX = laneX.get(selectedStep.destination)!;
      const width = Math.min(
        messageMaxWidth,
        Math.max(96, Math.abs(destinationX - x) - 44),
      );
      return {
        height: messageHeight + 14,
        left: (x + destinationX) / 2 - width / 2 - 7,
        top: y - messageHeight / 2 - 7,
        width: width + 14,
      };
    }
    if (selectedStep.kind === 'check') {
      return {
        height: itemHeight + 14,
        left: x - checkWidth / 2 - 7,
        top: y - itemHeight / 2 - 7,
        width: checkWidth + 14,
      };
    }
    if (selectedStep.kind === 'summary') {
      return {
        height: summaryHeight + 14,
        left: x - summaryWidth / 2 - 7,
        top: y - summaryHeight / 2 - 7,
        width: summaryWidth + 14,
      };
    }
    if (
      selectedStep.kind === 'activation-start' ||
      selectedStep.kind === 'activation-end' ||
      selectedStep.kind === 'wait' ||
      selectedStep.kind === 'resume' ||
      selectedStep.kind === 'close'
    ) {
      return {
        height: 38,
        left: x - markerWidth / 2 - 7,
        top: y - 19,
        width: markerWidth + 14,
      };
    }
    return {
      height: 42,
      left: x - localEventWidth / 2 - 7,
      top: y - 21,
      width: localEventWidth + 14,
    };
  };

  const selectedStepIndex = items.findIndex((item) =>
    item.members.some(({ id }) => id === selectedItemId),
  );
  const selectedStep = items[selectedStepIndex];
  const selectedStepY =
    selectedStep === undefined
      ? undefined
      : flowCanvasTopPadding + selectedStepIndex * flowRowGap + flowRowGap / 2;
  const selectedBounds =
    selectedStep === undefined
      ? null
      : stepBounds(selectedStep, selectedStepIndex);

  /** Warned steps get a numbered badge on the card's top-right corner. */
  const warningBadges = items.flatMap((item, index) => {
    const warning = item.members
      .map(({ id }) => layout.warningByItemId.get(id))
      .find((found) => found !== undefined);
    if (warning === undefined) return [];
    const bounds = stepBounds(item, index);
    return [
      {
        id: item.id,
        number: warning.number,
        message: warning.message,
        x: bounds.left + bounds.width - 7,
        y: bounds.top + 7,
      },
    ];
  });

  return (
    <LayoutGroup id={`flow-selection-${flowId}`}>
      <div className="relative" style={{ height, width }}>
        <AnimatePresence initial={false}>
          {selectedBounds !== null && (
            <motion.div
              layout
              layoutId="flow-step-highlight"
              data-flow-focus-indicator
              className="pointer-events-none absolute z-10 rounded-[13px] border-4 border-primary shadow-[0_0_18px_color-mix(in_oklab,var(--color-primary)_38%,transparent),inset_0_0_10px_color-mix(in_oklab,var(--color-primary)_12%,transparent)]"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{
                layout: {
                  type: 'spring',
                  stiffness: 460,
                  damping: 38,
                  mass: 0.7,
                },
                opacity: { duration: 0.14 },
                scale: { duration: 0.14 },
              }}
              style={selectedBounds}
            />
          )}
        </AnimatePresence>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Flow ${flowId} across ${participants.length} participants`}
          className="block min-w-full"
        >
          <defs>
            <marker
              id={`${markerId}-arrow`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="11"
              markerHeight="11"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={messageColor} />
            </marker>
          </defs>

          {participants.map((participant) => {
            const x = laneX.get(participant)!;
            const silent = silentParticipants.has(participant);
            return (
              <g key={participant}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={laneEndY}
                  stroke="var(--color-muted-foreground)"
                  strokeOpacity={silent ? 0.25 : 0.5}
                />
              </g>
            );
          })}

          {activations.map((activation) => {
            const x =
              laneX.get(activation.participantName)! +
              activation.track * railTrackGap;
            const activationRailWidth = activation.track === 0 ? railWidth : 5;
            const highlighted =
              selectedStep !== undefined &&
              selectedStepY !== undefined &&
              selectedStep.participantName === activation.participantName &&
              selectedStepY >= activation.startY &&
              selectedStepY <= activation.endY;
            const color = activation.outcome
              ? activationColor[activation.outcome]
              : activation.open
                ? openRailColor
                : neutral;
            return (
              <g
                key={`${activation.participantName}-${activation.startY}`}
                data-flow-activation={activation.outcome ?? 'open'}
                data-flow-activation-track={activation.track}
                data-highlighted={highlighted || undefined}
              >
                <rect
                  x={x - (activationRailWidth + 10) / 2}
                  y={activation.startY}
                  width={activationRailWidth + 10}
                  height={Math.max(2, activation.endY - activation.startY)}
                  rx={(activationRailWidth + 10) / 2}
                  fill={color}
                  fillOpacity={0.32}
                  style={{
                    filter: `drop-shadow(0 0 7px ${color})`,
                    opacity: highlighted ? 1 : 0,
                    transition: highlighted
                      ? 'opacity 180ms ease-out'
                      : 'opacity 120ms ease-in',
                  }}
                />
                <rect
                  x={x - activationRailWidth / 2}
                  y={activation.startY}
                  width={activationRailWidth}
                  height={Math.max(2, activation.endY - activation.startY)}
                  rx={activationRailWidth / 2}
                  fill={color}
                  style={{
                    fillOpacity: activation.open || highlighted ? 1 : 0.7,
                    transition: highlighted
                      ? 'fill-opacity 180ms ease-out'
                      : 'fill-opacity 120ms ease-in',
                  }}
                >
                  <title>
                    {`${activation.name} — ${activation.outcome ?? 'still active'}`}
                  </title>
                </rect>
                <rect
                  x={x - activationRailWidth / 4}
                  y={activation.startY + 2}
                  width={Math.max(1, activationRailWidth / 4)}
                  height={Math.max(0, activation.endY - activation.startY - 4)}
                  rx={activationRailWidth / 8}
                  fill="var(--color-foreground)"
                  fillOpacity={0.55}
                  pointerEvents="none"
                  style={{
                    opacity: highlighted ? 1 : 0,
                    transition: highlighted
                      ? 'opacity 180ms ease-out'
                      : 'opacity 120ms ease-in',
                  }}
                />
                {!activation.open && activation.outcome !== null && (
                  <rect
                    x={x - activationRailWidth}
                    y={activation.endY - 2}
                    width={activationRailWidth * 2}
                    height={4}
                    rx={2}
                    fill={
                      activation.outcome === 'interrupted'
                        ? 'var(--color-card)'
                        : color
                    }
                    stroke={color}
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}

          <g data-flow-message-connectors pointerEvents="none">
            {items.map((item, index) => {
              if (item.kind !== 'message') return null;
              const selected = item.members.some(
                ({ id }) => id === selectedItemId,
              );
              const y =
                flowCanvasTopPadding + index * flowRowGap + flowRowGap / 2;
              const x = laneX.get(item.participantName)!;
              const destinationX = laneX.get(item.destination)!;
              return (
                <g key={item.id}>
                  <line
                    data-flow-message-halo
                    data-active={selected || undefined}
                    x1={x}
                    y1={y}
                    x2={destinationX}
                    y2={y}
                    stroke={messageColor}
                    strokeOpacity={selected ? 0.3 : 0}
                    strokeWidth={12}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-opacity 140ms ease-out' }}
                  />
                  <line
                    data-flow-message-line
                    x1={x}
                    y1={y}
                    x2={destinationX}
                    y2={y}
                    stroke={messageColor}
                    strokeWidth={selected ? 4 : 1.5}
                    strokeDasharray={
                      item.replyTo === undefined ? undefined : '6 4'
                    }
                    markerEnd={`url(#${markerId}-arrow)`}
                    style={{ transition: 'stroke-width 140ms ease-out' }}
                  />
                </g>
              );
            })}
          </g>

          {waits.map((wait) => {
            const x = laneX.get(wait.participantName)!;
            return (
              <g
                key={`wait-${wait.participantName}-${wait.startY}`}
                data-flow-wait={wait.open ? 'open' : 'resumed'}
              >
                <line
                  x1={x}
                  y1={wait.startY + 4}
                  x2={x}
                  y2={wait.endY - 4}
                  stroke="var(--color-card)"
                  strokeWidth={railWidth + 2}
                  strokeDasharray="4 5"
                >
                  <title>
                    {`Waiting: ${wait.name}${wait.open ? '' : ' (resumed)'}`}
                  </title>
                </line>
              </g>
            );
          })}
          {items.map((item, index) => {
            const selectedMember = item.members.find(
              ({ id }) => id === selectedItemId,
            );
            const selected = selectedMember !== undefined;
            const hovered = item.id === hoveredItemId;
            const y =
              flowCanvasTopPadding + index * flowRowGap + flowRowGap / 2;
            const x = laneX.get(item.participantName)!;
            const label =
              item.kind !== 'summary' && item.repeatCount > 1
                ? `${item.name} ×${item.repeatCount}`
                : item.name;

            if (item.kind === 'summary') {
              const activate = () => onItemClick?.(item.members[0]!);
              const firstName = item.members[0]!.name;
              const lastName = item.members.at(-1)!.name;
              const middleCount = item.members.length - 2;
              return (
                <g
                  key={item.id}
                  data-flow-item="summary"
                  data-flow-collapsed-summary
                  data-selected={selected || undefined}
                  role={onItemClick ? 'button' : undefined}
                  tabIndex={onItemClick ? 0 : undefined}
                  aria-label={onItemClick ? `Open ${label} summary` : undefined}
                  onClick={activate}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') activate();
                  }}
                  onMouseEnter={() => {
                    if (!selected) setHoveredItemId(item.id);
                  }}
                  onMouseLeave={() => setHoveredItemId(null)}
                  style={{
                    cursor: onItemClick ? 'pointer' : 'default',
                    outline: 'none',
                  }}
                >
                  <rect
                    x={0}
                    y={y - flowRowGap / 2}
                    width={width}
                    height={flowRowGap}
                    fill={
                      hovered && !selected
                        ? 'color-mix(in oklab, var(--color-primary) 3%, transparent)'
                        : 'transparent'
                    }
                    style={{ transition: 'fill 120ms ease-out' }}
                  />
                  <rect
                    x={x - summaryWidth / 2 + 7}
                    y={y - summaryHeight / 2 + 7}
                    width={summaryWidth}
                    height={summaryHeight}
                    rx={10}
                    fill="color-mix(in oklab, var(--color-primary) 5%, var(--color-card))"
                    stroke="color-mix(in oklab, var(--color-primary) 30%, var(--color-border))"
                    strokeWidth={1}
                  />
                  <rect
                    x={x - summaryWidth / 2 + 3.5}
                    y={y - summaryHeight / 2 + 3.5}
                    width={summaryWidth}
                    height={summaryHeight}
                    rx={10}
                    fill="color-mix(in oklab, var(--color-primary) 8%, var(--color-card))"
                    stroke="color-mix(in oklab, var(--color-primary) 45%, var(--color-border))"
                    strokeWidth={1}
                  />
                  <rect
                    x={x - summaryWidth / 2}
                    y={y - summaryHeight / 2}
                    width={summaryWidth}
                    height={summaryHeight}
                    rx={10}
                    fill="color-mix(in oklab, var(--color-primary) 10%, var(--color-card))"
                    stroke="color-mix(in oklab, var(--color-primary) 70%, var(--color-border))"
                    strokeWidth={1.5}
                  />
                  <foreignObject
                    x={x - summaryWidth / 2 + 12}
                    y={y - summaryHeight / 2 + 5}
                    width={summaryWidth - 24}
                    height={summaryHeight - 10}
                  >
                    <div
                      className="flex h-full min-w-0 flex-col items-center justify-center gap-0.5 text-center"
                      title={`${label} in ${item.participantName}`}
                    >
                      <span className="w-full truncate text-[11px] font-medium text-foreground">
                        {firstName}
                      </span>
                      <span className="text-[9px] font-semibold tracking-wide text-primary uppercase">
                        {middleCount} hidden{' '}
                        {middleCount === 1 ? 'step' : 'steps'}
                      </span>
                      <span className="w-full truncate text-[11px] font-medium text-foreground">
                        {lastName}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            }

            if (item.kind === 'message') {
              const activate = () => onItemClick?.(item.members[0]!);
              const latency = replyLatency.get(item.id);
              const destinationX = laneX.get(item.destination)!;
              const messageWidth = Math.min(
                messageMaxWidth,
                Math.max(96, Math.abs(destinationX - x) - 44),
              );
              const messageX = (x + destinationX) / 2 - messageWidth / 2;
              return (
                <g
                  key={item.id}
                  data-flow-item="message"
                  data-selected={selected || undefined}
                  role={onItemClick ? 'button' : undefined}
                  tabIndex={onItemClick ? 0 : undefined}
                  aria-label={
                    onItemClick ? `Open ${label} log entry` : undefined
                  }
                  onClick={activate}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') activate();
                  }}
                  onMouseEnter={() => {
                    if (!selected) setHoveredItemId(item.id);
                  }}
                  onMouseLeave={() => setHoveredItemId(null)}
                  style={{
                    cursor: onItemClick ? 'pointer' : 'default',
                    outline: 'none',
                  }}
                >
                  <rect
                    x={0}
                    y={y - flowRowGap / 2}
                    width={width}
                    height={flowRowGap}
                    fill={
                      selected
                        ? 'transparent'
                        : hovered
                          ? 'color-mix(in oklab, var(--color-primary) 3%, transparent)'
                          : 'transparent'
                    }
                    style={{ transition: 'fill 120ms ease-out' }}
                  />
                  {latency !== undefined && (
                    <text
                      x={(x + destinationX) / 2}
                      y={y - messageHeight / 2 - 6}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--color-muted-foreground)"
                    >
                      {formatDuration(latency)}
                    </text>
                  )}
                  <rect
                    x={messageX}
                    y={y - messageHeight / 2}
                    width={messageWidth}
                    height={messageHeight}
                    rx={7}
                    fill="var(--color-card)"
                    stroke={messageColor}
                    strokeWidth={1}
                  />
                  <foreignObject
                    x={messageX + 10}
                    y={y - messageHeight / 2 + 1}
                    width={messageWidth - 20}
                    height={messageHeight - 2}
                  >
                    <div
                      className="truncate text-center text-xs leading-[26px] font-semibold"
                      style={{ color: messageColor }}
                      title={`${item.participantName} → ${item.destination}: ${label}`}
                    >
                      {item.replyTo === undefined ? label : `↩ ${label}`}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            if (item.kind === 'check') {
              const color = checkColor(item.passed);
              const activate = () => onItemClick?.(item.members[0]!);
              return (
                <g
                  key={item.id}
                  data-flow-item="check"
                  data-flow-check={item.passed ? 'passed' : 'failed'}
                  data-selected={selected || undefined}
                  role={onItemClick ? 'button' : undefined}
                  tabIndex={onItemClick ? 0 : undefined}
                  aria-label={onItemClick ? `Open ${label} check` : undefined}
                  onClick={activate}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') activate();
                  }}
                  onMouseEnter={() => {
                    if (!selected) setHoveredItemId(item.id);
                  }}
                  onMouseLeave={() => setHoveredItemId(null)}
                  style={{
                    cursor: onItemClick ? 'pointer' : 'default',
                    outline: 'none',
                  }}
                >
                  <rect
                    x={0}
                    y={y - flowRowGap / 2}
                    width={width}
                    height={flowRowGap}
                    fill={
                      selected
                        ? 'transparent'
                        : hovered
                          ? 'color-mix(in oklab, var(--color-primary) 3%, transparent)'
                          : 'transparent'
                    }
                    style={{ transition: 'fill 120ms ease-out' }}
                  />
                  <rect
                    x={x - checkWidth / 2}
                    y={y - itemHeight / 2}
                    width={checkWidth}
                    height={itemHeight}
                    rx={itemHeight / 2}
                    fill="var(--color-card)"
                    stroke={color}
                    strokeWidth={item.passed ? 1 : 1.5}
                  />
                  <foreignObject
                    x={x - checkWidth / 2 + 10}
                    y={y - itemHeight / 2 + 4}
                    width={checkWidth - 20}
                    height={itemHeight - 8}
                  >
                    <div
                      className="flex h-full min-w-0 items-center justify-center gap-1.5 text-foreground"
                      title={`${label}: ${item.passed ? 'held' : 'did not hold'}`}
                    >
                      <span
                        className="shrink-0 text-xs font-bold"
                        style={{ color }}
                      >
                        {item.passed ? '✓' : '✕'}
                      </span>
                      <span className="min-w-0 truncate text-xs font-semibold">
                        {label}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            }

            if (
              item.kind === 'activation-start' ||
              item.kind === 'activation-end' ||
              item.kind === 'wait' ||
              item.kind === 'resume' ||
              item.kind === 'close'
            ) {
              const boundaryColor =
                item.kind === 'activation-end'
                  ? activationColor[item.outcome]
                  : item.kind === 'activation-start'
                    ? openRailColor
                    : neutral;
              const word =
                item.kind === 'activation-end'
                  ? `End · ${item.outcome}`
                  : markerWord[item.kind]!;
              const activate = () => onItemClick?.(item.members[0]!);
              return (
                <g
                  key={item.id}
                  data-flow-item={item.kind}
                  data-selected={selected || undefined}
                  role={onItemClick ? 'button' : undefined}
                  tabIndex={onItemClick ? 0 : undefined}
                  aria-label={onItemClick ? `Open ${label}` : undefined}
                  onClick={activate}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') activate();
                  }}
                  onMouseEnter={() => {
                    if (!selected) setHoveredItemId(item.id);
                  }}
                  onMouseLeave={() => setHoveredItemId(null)}
                  style={{
                    cursor: onItemClick ? 'pointer' : 'default',
                    outline: 'none',
                  }}
                >
                  <rect
                    x={0}
                    y={y - flowRowGap / 2}
                    width={width}
                    height={flowRowGap}
                    fill={
                      hovered && !selected
                        ? 'color-mix(in oklab, var(--color-primary) 3%, transparent)'
                        : 'transparent'
                    }
                    style={{ transition: 'fill 120ms ease-out' }}
                  />
                  <rect
                    x={x - markerWidth / 2}
                    y={y - 12}
                    width={markerWidth}
                    height={24}
                    rx={4}
                    fill="var(--color-card)"
                    stroke={boundaryColor}
                    strokeWidth={item.kind === 'activation-start' ? 1.5 : 1}
                  />
                  <foreignObject
                    x={x - markerWidth / 2 + 8}
                    y={y - 11}
                    width={markerWidth - 16}
                    height={22}
                  >
                    <div
                      className="flex items-baseline justify-center gap-1.5 truncate text-center leading-[22px]"
                      title={`${word}: ${label}`}
                    >
                      <span
                        className="shrink-0 text-[9px] font-semibold tracking-wider uppercase"
                        style={{ color: boundaryColor }}
                      >
                        {word}
                      </span>
                      <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
                        {label}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            }

            const color = eventColor[item.severity as RecordedFlowSeverity];
            const activate = () =>
              onItemClick?.(selectedMember ?? item.members[0]!);

            return (
              <g
                key={item.id}
                data-flow-item="event"
                data-selected={selected || undefined}
                role={onItemClick ? 'button' : undefined}
                tabIndex={onItemClick ? 0 : undefined}
                aria-label={onItemClick ? `Open ${label} log entry` : undefined}
                onClick={activate}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') activate();
                }}
                onMouseEnter={() => {
                  if (!selected) setHoveredItemId(item.id);
                }}
                onMouseLeave={() => setHoveredItemId(null)}
                style={{
                  cursor: onItemClick ? 'pointer' : 'default',
                  outline: 'none',
                }}
              >
                <rect
                  x={0}
                  y={y - flowRowGap / 2}
                  width={width}
                  height={flowRowGap}
                  fill={
                    selected
                      ? 'transparent'
                      : hovered
                        ? 'color-mix(in oklab, var(--color-primary) 3%, transparent)'
                        : 'transparent'
                  }
                  style={{ transition: 'fill 120ms ease-out' }}
                />
                <rect
                  x={x - localEventWidth / 2}
                  y={y - 14}
                  width={localEventWidth}
                  height={28}
                  rx={7}
                  fill="var(--color-card)"
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
                <foreignObject
                  x={x - localEventWidth / 2 + 10}
                  y={y - 13}
                  width={localEventWidth - 20}
                  height={26}
                >
                  <div
                    className="truncate text-center text-xs leading-[26px] font-medium"
                    style={{ color }}
                    title={label}
                  >
                    {label}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {warningBadges.map((badge) => (
            <g
              key={`warning-${badge.id}`}
              data-flow-warning={badge.number}
              className="pointer-events-none"
            >
              <circle
                cx={badge.x}
                cy={badge.y}
                r={9}
                fill={failure}
                stroke="var(--color-card)"
                strokeWidth={2}
              />
              <text
                x={badge.x}
                y={badge.y + 3.5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="var(--color-destructive-foreground, white)"
              >
                {badge.number}
              </text>
              <title>{`Warning ${badge.number}: ${badge.message}`}</title>
            </g>
          ))}

          {items.length === 0 && (
            <text
              x={width / 2}
              y={flowCanvasTopPadding + flowRowGap / 2}
              textAnchor="middle"
              fontSize={13}
              fill="var(--color-muted-foreground)"
            >
              No Flow items
            </text>
          )}
        </svg>
      </div>
    </LayoutGroup>
  );
}
