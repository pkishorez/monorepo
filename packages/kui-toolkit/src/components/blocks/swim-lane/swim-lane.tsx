import { useEffect, useId, useState } from 'react';
import { Button } from '#components/ui/button';
import { Minus, Plus, RotateCcw } from '#lib/lucide';
import { scrollbarStyles } from '#lib/scrollStyles';

export interface SwimLaneActor {
  id: string;
  label: string;
  detail?: string;
}

export interface SwimLaneMessage {
  from: string;
  to: string;
  label: string;
  detail?: string;
  level?: number;
  kind?: 'call' | 'return';
}

export interface SwimLaneProps {
  actors: SwimLaneActor[];
  messages: SwimLaneMessage[];
  label: string;
  title: string;
}

const highlightColor = 'var(--color-primary)';
const neutralColor = 'var(--color-foreground)';

const laneGap = 252;
const actorWidth = 220;
const sidePadding = actorWidth / 2 + 24;
const actorHeight = 58;
const actorTop = 16;
const timelineTop = actorTop + actorHeight;
const messageTop = 126;
const levelGap = 76;
const minZoom = 0.75;
const maxZoom = 2;
const zoomStep = 0.25;
const defaultZoom = 1.5;

/** Renders a data-driven sequence diagram with evenly spaced actor lanes. */
export function SwimLane({ actors, messages, label, title }: SwimLaneProps) {
  const markerId = useId().replaceAll(':', '');
  const [hoveredActorId, setHoveredActorId] = useState<string | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(defaultZoom);
  const activeActorId = selectedActorId ?? hoveredActorId;
  const width = sidePadding * 2 + laneGap * (actors.length - 1);
  const maxLevel = Math.max(
    0,
    ...messages.map((message, index) => message.level ?? index),
  );
  const height = messageTop + maxLevel * levelGap + 62;
  const laneById = new Map(
    actors.map((actor, index) => [actor.id, sidePadding + index * laneGap]),
  );

  useEffect(() => {
    if (selectedActorId === null) return;

    const selectedActorKey = `${markerId}-${selectedActorId}`;
    const clearSelection = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const actor = event.target.closest('[data-swim-lane-actor]');
      if (actor?.getAttribute('data-swim-lane-actor') === selectedActorKey)
        return;
      setSelectedActorId(null);
    };

    document.addEventListener('pointerdown', clearSelection);
    return () => document.removeEventListener('pointerdown', clearSelection);
  }, [markerId, selectedActorId]);

  return (
    <div className="not-prose my-8 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-4 py-2">
        <div className="font-medium text-foreground">{title}</div>
        <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom out"
            disabled={zoom <= minZoom}
            onClick={() =>
              setZoom((current) => Math.max(minZoom, current - zoomStep))
            }
          >
            <Minus />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Reset zoom"
            disabled={zoom === defaultZoom}
            onClick={() => setZoom(defaultZoom)}
          >
            <RotateCcw />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom in"
            disabled={zoom >= maxZoom}
            onClick={() =>
              setZoom((current) => Math.min(maxZoom, current + zoomStep))
            }
          >
            <Plus />
          </Button>
        </div>
      </div>

      <div className={`overflow-x-auto p-4 ${scrollbarStyles}`}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={label}
          style={{
            width: `${zoom * 100}%`,
            minWidth: `${Math.min(width, 780) * zoom}px`,
            height: 'auto',
          }}
        >
          <defs>
            {Object.entries({
              neutral: neutralColor,
              highlight: highlightColor,
            }).map(([name, color]) => (
              <marker
                key={name}
                id={`${markerId}-${name}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: color }} />
              </marker>
            ))}
          </defs>

          {actors.map((actor, index) => {
            const x = sidePadding + index * laneGap;
            const isActive = actor.id === activeActorId;
            const isSelected = actor.id === selectedActorId;
            const nodeColor = isActive ? highlightColor : neutralColor;

            return (
              <g key={actor.id}>
                <g
                  data-swim-lane-actor={`${markerId}-${actor.id}`}
                  onMouseEnter={() => {
                    if (selectedActorId === null) setHoveredActorId(actor.id);
                  }}
                  onMouseLeave={() => {
                    if (selectedActorId === null) setHoveredActorId(null);
                  }}
                  onClick={() => {
                    setHoveredActorId(null);
                    setSelectedActorId(actor.id);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x - actorWidth / 2}
                    y={actorTop}
                    width={actorWidth}
                    height={actorHeight}
                    rx="9"
                    strokeWidth={isSelected ? 2 : 1}
                    style={{
                      fill: `color-mix(in oklab, ${nodeColor} ${isSelected ? 28 : isActive ? 18 : 8}%, var(--color-card))`,
                      stroke: nodeColor,
                    }}
                  />
                  <text
                    x={x}
                    y={actor.detail ? actorTop + 25 : actorTop + 35}
                    textAnchor="middle"
                    fontWeight="600"
                    style={{ fill: nodeColor }}
                  >
                    {actor.label}
                  </text>
                  {actor.detail && (
                    <text
                      x={x}
                      y={actorTop + 45}
                      textAnchor="middle"
                      fontSize="11"
                      style={{ fill: nodeColor }}
                    >
                      {actor.detail}
                    </text>
                  )}
                </g>
                <line
                  x1={x}
                  y1={timelineTop}
                  x2={x}
                  y2={height - 18}
                  strokeDasharray="5 5"
                  strokeWidth={isSelected ? 2 : isActive ? 1.5 : 1}
                  style={{
                    stroke: isActive ? highlightColor : 'var(--color-border)',
                  }}
                />
              </g>
            );
          })}

          {messages.map((message, index) => {
            const fromX = laneById.get(message.from);
            const toX = laneById.get(message.to);
            if (fromX === undefined || toX === undefined) return null;

            const y = messageTop + (message.level ?? index) * levelGap;
            const isHighlighted =
              activeActorId !== null &&
              (message.from === activeActorId || message.to === activeActorId);
            const connectorColor = isHighlighted
              ? highlightColor
              : neutralColor;
            const markerName = isHighlighted ? 'highlight' : 'neutral';
            const isLoop = message.from === message.to;

            if (isLoop) {
              const loopWidth = 48;
              const loopHeight = 22;
              const loopY = y - loopHeight / 2;

              return (
                <g key={`${message.from}-${message.to}-${index}`}>
                  <path
                    d={`M ${fromX} ${loopY} C ${fromX + loopWidth} ${loopY}, ${fromX + loopWidth} ${loopY + loopHeight}, ${fromX + 2} ${loopY + loopHeight}`}
                    fill="none"
                    strokeWidth="1.5"
                    markerEnd={`url(#${markerId}-${markerName})`}
                    style={{ stroke: connectorColor }}
                  />
                  <text
                    x={fromX + loopWidth + 10}
                    y={y - 6}
                    fontSize="12"
                    fontWeight="600"
                    style={{ fill: connectorColor }}
                  >
                    {message.label}
                  </text>
                  {message.detail && (
                    <text
                      x={fromX + loopWidth + 10}
                      y={y + 10}
                      fontSize="11"
                      style={{ fill: connectorColor }}
                    >
                      {message.detail}
                    </text>
                  )}
                </g>
              );
            }

            const labelX = (fromX + toX) / 2;

            return (
              <g key={`${message.from}-${message.to}-${index}`}>
                <line
                  x1={fromX}
                  y1={y}
                  x2={toX}
                  y2={y}
                  strokeWidth="1.5"
                  strokeDasharray={
                    message.kind === 'return' ? '5 4' : undefined
                  }
                  markerEnd={`url(#${markerId}-${markerName})`}
                  style={{ stroke: connectorColor }}
                />
                <text
                  x={labelX}
                  y={y - 10}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  style={{ fill: connectorColor }}
                >
                  {message.label}
                </text>
                {message.detail && (
                  <text
                    x={labelX}
                    y={y + 16}
                    textAnchor="middle"
                    fontSize="11"
                    style={{ fill: connectorColor }}
                  >
                    {message.detail}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
