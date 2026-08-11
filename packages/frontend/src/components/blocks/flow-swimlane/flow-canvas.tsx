import { useId } from 'react';
import type { RecordedFlow } from '@pkishorez/effect-tracer/flow';
import { flowHeaderHeight, flowRowGap, type FlowLayout } from './layout';

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
  running: 'var(--color-primary)',
  success: 'var(--color-positive)',
  unset: 'var(--color-border)',
};

const messageColor = 'var(--color-primary)';

const formatDuration = (milliseconds: number) => {
  if (milliseconds < 0.001) return `${Math.round(milliseconds * 1_000_000)} ns`;
  if (milliseconds < 1) return `${Math.round(milliseconds * 1_000)} µs`;
  if (milliseconds < 1_000) return `${milliseconds.toFixed(2)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
};

export function FlowCanvas({
  flowId,
  layout,
  onActivityClick,
}: {
  readonly flowId: string;
  readonly layout: FlowLayout;
  readonly onActivityClick?:
    | ((activity: RecordedFlowActivity) => void)
    | undefined;
}) {
  const markerId = useId().replaceAll(':', '');
  const { height, items, laneX, participants, width } = layout;
  const terminalIndex = items.findIndex(
    (item) => item.kind === 'local-event' && item.status !== undefined,
  );
  const laneEndY =
    terminalIndex === -1
      ? height - 22
      : flowHeaderHeight + terminalIndex * flowRowGap + flowRowGap / 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Flow ${flowId} across ${participants.length} participants`}
      className="min-w-full"
    >
      <defs>
        <marker
          id={`${markerId}-arrow`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={messageColor} />
        </marker>
      </defs>

      {participants.map((participant) => {
        const x = laneX.get(participant)!;
        return (
          <g key={participant}>
            <rect
              x={x - 94}
              y={12}
              width={188}
              height={42}
              rx={9}
              fill="var(--color-muted)"
              stroke="var(--color-border)"
            />
            <foreignObject x={x - 86} y={20} width={172} height={26}>
              <div
                className="truncate text-center text-[13px] leading-[26px] font-semibold text-foreground"
                title={participant}
              >
                {participant}
              </div>
            </foreignObject>
            <line
              x1={x}
              y1={54}
              x2={x}
              y2={laneEndY}
              stroke="var(--color-muted-foreground)"
              strokeOpacity={0.5}
              strokeDasharray="5 5"
            />
          </g>
        );
      })}

      {items.map((item, index) => {
        const y = flowHeaderHeight + index * flowRowGap + flowRowGap / 2;
        const x = laneX.get(item.participantName)!;

        if (item.kind === 'message') {
          const destinationX = laneX.get(item.destination)!;
          const messageWidth = Math.min(
            messageMaxWidth,
            Math.max(96, Math.abs(destinationX - x) - 44),
          );
          const messageX = (x + destinationX) / 2 - messageWidth / 2;
          return (
            <g key={item.id} data-flow-item="message">
              <line
                x1={x}
                y1={y}
                x2={destinationX}
                y2={y}
                stroke={messageColor}
                strokeWidth={1.5}
                markerEnd={`url(#${markerId}-arrow)`}
              />
              <rect
                x={messageX}
                y={y - messageHeight / 2}
                width={messageWidth}
                height={messageHeight}
                rx={7}
                fill="var(--color-card)"
                stroke={messageColor}
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
                  title={`${item.participantName} → ${item.destination}: ${item.name}`}
                >
                  {item.name}
                </div>
              </foreignObject>
            </g>
          );
        }

        if (item.kind === 'activity') {
          const activate = () => onActivityClick?.(item);
          return (
            <g
              key={item.id}
              data-flow-item="activity"
              role={onActivityClick ? 'button' : undefined}
              tabIndex={onActivityClick ? 0 : undefined}
              aria-label={
                onActivityClick ? `Open ${item.name} activity` : undefined
              }
              onClick={activate}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') activate();
              }}
              style={{ cursor: onActivityClick ? 'pointer' : 'default' }}
            >
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
                  title={item.name}
                >
                  <span className="w-full truncate text-center text-xs font-semibold">
                    {item.name}
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

        const terminalColor =
          item.status === 'completed'
            ? 'var(--color-positive)'
            : item.status === 'failed'
              ? 'var(--color-destructive)'
              : item.status === 'cancelled'
                ? 'var(--color-muted-foreground)'
                : undefined;
        const color = terminalColor ?? eventColor[item.severity];

        return (
          <g
            key={item.id}
            data-flow-item="local-event"
            data-flow-terminal={item.status ?? undefined}
          >
            <rect
              x={x - localEventWidth / 2}
              y={y - 14}
              width={localEventWidth}
              height={28}
              rx={7}
              fill={
                terminalColor
                  ? `color-mix(in oklab, ${terminalColor} 7%, var(--color-card))`
                  : 'var(--color-card)'
              }
              stroke={terminalColor ?? 'var(--color-border)'}
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
                title={item.name}
              >
                {item.name}
              </div>
            </foreignObject>
          </g>
        );
      })}

      {items.length === 0 && (
        <text
          x={width / 2}
          y={flowHeaderHeight + flowRowGap / 2}
          textAnchor="middle"
          fontSize={13}
          fill="var(--color-muted-foreground)"
        >
          No Flow items
        </text>
      )}
    </svg>
  );
}
