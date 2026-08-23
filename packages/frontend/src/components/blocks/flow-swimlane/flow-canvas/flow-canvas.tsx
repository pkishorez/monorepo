import { useId, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from '#lib/motion';
import {
  flowCanvasTopPadding,
  flowRowGap,
  type FlowLayout,
  type RecordedFlow,
} from '../flow-presentation';

type RecordedFlowActivity = Extract<
  RecordedFlow['items'][number],
  { kind: 'activity' }
>;
type FlowActivityStatus = RecordedFlowActivity['status'];
type RecordedFlowSeverity = Extract<
  RecordedFlow['items'][number],
  { severity: unknown }
>['severity'];

const activityWidth = 196;
const itemHeight = 48;
const localEventWidth = 170;
const summaryHeight = 58;
const summaryWidth = 196;
const messageHeight = 28;
const messageMaxWidth = 208;

const eventColor: Record<RecordedFlowSeverity, string> = {
  debug: 'var(--color-muted-foreground)',
  error: 'var(--color-destructive)',
  info: 'var(--color-primary)',
  warning: 'var(--color-foreground)',
};

const activityColor: Record<FlowActivityStatus, string> = {
  error: 'var(--color-destructive)',
  interrupted: 'var(--color-amber-500)',
  running: 'var(--color-primary)',
  success: 'var(--color-positive)',
  unset: 'var(--color-border)',
};

const messageColor = 'var(--color-primary)';

type ActivationOutcome = RecordedFlow['activations'][number]['outcome'];

const activationColor: Record<NonNullable<ActivationOutcome>, string> = {
  completed: 'var(--color-positive)',
  failed: 'var(--color-destructive)',
  interrupted: 'var(--color-amber-500)',
};

const railWidth = 9;
const openRailColor = 'var(--color-primary)';

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
  onActivityClick,
}: {
  readonly flowId: string;
  readonly layout: FlowLayout;
  readonly selectedItemId?: string | null | undefined;
  readonly onItemClick?:
    | ((item: RecordedFlow['items'][number]) => void)
    | undefined;
  readonly onActivityClick?:
    | ((activity: RecordedFlowActivity) => void)
    | undefined;
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
    width,
  } = layout;

  const selectedStepIndex = items.findIndex((item) =>
    item.members.some(({ id }) => id === selectedItemId),
  );
  const selectedStep = items[selectedStepIndex];
  const selectedBounds = (() => {
    if (selectedStep === undefined) return null;
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
    if (selectedStep.kind === 'activity') {
      return {
        height: itemHeight + 14,
        left: x - activityWidth / 2 - 7,
        top: y - itemHeight / 2 - 7,
        width: activityWidth + 14,
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
      selectedStep.kind === 'activation-end'
    ) {
      return {
        height: 38,
        left: x - localEventWidth / 2 - 7,
        top: y - 19,
        width: localEventWidth + 14,
      };
    }
    return {
      height: 42,
      left: x - localEventWidth / 2 - 7,
      top: y - 21,
      width: localEventWidth + 14,
    };
  })();

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
                  strokeOpacity={0.5}
                  strokeDasharray={silent ? '2 5' : '5 5'}
                />
              </g>
            );
          })}

          {activations.map((activation, index) => {
            const x = laneX.get(activation.participantName)!;
            const color = activation.outcome
              ? activationColor[activation.outcome]
              : openRailColor;
            const gradientId = `${markerId}-rail-${index}`;
            return (
              <g
                key={`${activation.participantName}-${activation.startY}`}
                data-flow-activation={activation.outcome ?? 'open'}
              >
                {activation.open && (
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                )}
                <rect
                  x={x - railWidth / 2}
                  y={activation.startY}
                  width={railWidth}
                  height={Math.max(2, activation.endY - activation.startY)}
                  rx={railWidth / 2}
                  fill={activation.open ? `url(#${gradientId})` : color}
                  fillOpacity={activation.open ? 1 : 0.85}
                >
                  <title>
                    {`${activation.name} — ${activation.outcome ?? 'still active'}`}
                  </title>
                </rect>
                {!activation.open && (
                  <rect
                    x={x - railWidth}
                    y={activation.endY - 2}
                    width={railWidth * 2}
                    height={4}
                    rx={2}
                    fill={color}
                  />
                )}
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
                  {latency !== undefined && (
                    <text
                      x={(x + destinationX) / 2}
                      y={y - messageHeight / 2 - 6}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--color-muted-foreground)"
                    >
                      {`↩ ${formatDuration(latency)}`}
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
                      {label}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            if (item.kind === 'activity') {
              const clickable =
                onItemClick !== undefined || onActivityClick !== undefined;
              const activate = () => {
                onItemClick?.(item.members[0]!);
                onActivityClick?.(item);
              };
              return (
                <g
                  key={item.id}
                  data-flow-item="activity"
                  data-selected={selected || undefined}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? `Open ${label} activity` : undefined}
                  onClick={activate}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') activate();
                  }}
                  onMouseEnter={() => {
                    if (!selected) setHoveredItemId(item.id);
                  }}
                  onMouseLeave={() => setHoveredItemId(null)}
                  style={{
                    cursor: clickable ? 'pointer' : 'default',
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
                    x={x - activityWidth / 2}
                    y={y - itemHeight / 2}
                    width={activityWidth}
                    height={itemHeight}
                    rx={9}
                    fill={`color-mix(in oklab, ${activityColor[item.status]} 7%, var(--color-card))`}
                    stroke={activityColor[item.status]}
                    strokeWidth={1.5}
                  />
                  <foreignObject
                    x={x - activityWidth / 2 + 10}
                    y={y - itemHeight / 2 + 5}
                    width={activityWidth - 20}
                    height={itemHeight - 10}
                  >
                    <div
                      className="flex h-full min-w-0 flex-col items-center justify-center text-foreground"
                      title={label}
                    >
                      <span className="w-full truncate text-center text-xs font-semibold">
                        {label}
                      </span>
                      {item.duration !== null && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            if (
              item.kind === 'activation-start' ||
              item.kind === 'activation-end'
            ) {
              const boundaryColor =
                item.kind === 'activation-end'
                  ? activationColor[item.outcome]
                  : openRailColor;
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
                    x={x - localEventWidth / 2}
                    y={y - 12}
                    width={localEventWidth}
                    height={24}
                    rx={4}
                    fill={`color-mix(in oklab, ${boundaryColor} 14%, var(--color-card))`}
                    stroke={boundaryColor}
                    strokeWidth={1.5}
                  />
                  <foreignObject
                    x={x - localEventWidth / 2 + 8}
                    y={y - 11}
                    width={localEventWidth - 16}
                    height={22}
                  >
                    <div
                      className="truncate text-center text-[11px] leading-[22px] font-semibold tracking-wide uppercase"
                      style={{ color: boundaryColor }}
                      title={label}
                    >
                      {item.kind === 'activation-start'
                        ? `▸ ${label}`
                        : `■ ${label}`}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            const color = eventColor[item.severity];
            const activate = () =>
              onItemClick?.(selectedMember ?? item.members[0]!);

            return (
              <g
                key={item.id}
                data-flow-item="local-event"
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
