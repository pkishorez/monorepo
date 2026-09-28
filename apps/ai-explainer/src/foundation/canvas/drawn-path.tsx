// A line that draws itself from start to end.
export function DrawnPath({
  d,
  progress,
  className,
  dashed,
  width = 3,
  arrow,
}: {
  d: string;
  progress: number;
  className?: string;
  dashed?: boolean;
  width?: number;
  arrow?: boolean;
}) {
  const id = `arrow-${d.replace(/[^0-9]/g, '').slice(0, 12)}`;
  return (
    <svg
      className={`pointer-events-none absolute overflow-visible ${className ?? ''}`}
      style={{ left: 0, top: 0, width: 1, height: 1 }}
    >
      {arrow && (
        <defs>
          <marker
            id={id}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
      )}
      {dashed ? (
        <>
          <mask id={`${id}-mask`}>
            <path
              d={d}
              pathLength={1}
              stroke="white"
              strokeWidth={width + 4}
              fill="none"
              strokeDasharray="1 1"
              strokeDashoffset={1 - progress}
            />
          </mask>
          <path
            d={d}
            stroke="currentColor"
            strokeWidth={width}
            fill="none"
            strokeDasharray="10 9"
            strokeLinecap="round"
            mask={`url(#${id}-mask)`}
            markerEnd={arrow && progress > 0.98 ? `url(#${id})` : undefined}
          />
        </>
      ) : (
        <path
          d={d}
          pathLength={1}
          stroke="currentColor"
          strokeWidth={width}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="1 1"
          strokeDashoffset={1 - progress}
          opacity={progress > 0 ? 1 : 0}
          markerEnd={arrow && progress > 0.98 ? `url(#${id})` : undefined}
        />
      )}
    </svg>
  );
}
