import { formatDuration } from '../trace-model';
import { BAR_COL_INSET } from './layout';

interface GanttHeaderProps {
  traceStart: number;
  traceEnd: number;
  tickCount?: number;
}

export function GanttHeader({
  traceStart,
  traceEnd,
  tickCount = 6,
}: GanttHeaderProps) {
  const duration = traceEnd - traceStart;
  const ticks = Array.from(
    { length: tickCount },
    (_, i) => i / (tickCount - 1),
  );

  return (
    <div
      className="relative flex h-8 shrink-0 items-center"
      style={{ marginLeft: BAR_COL_INSET, marginRight: BAR_COL_INSET }}
    >
      {ticks.map((pct, i) => {
        const isFirst = i === 0;
        const isLast = i === tickCount - 1;

        const style: React.CSSProperties = isFirst
          ? { left: 0 }
          : isLast
            ? { right: 0 }
            : {
                left: `${(pct * 100).toFixed(2)}%`,
                transform: 'translateX(-50%)',
              };

        return (
          <div key={pct} className="absolute" style={style}>
            <span className="select-none whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
              {pct === 0 ? '+0' : `+${formatDuration(pct * duration)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
