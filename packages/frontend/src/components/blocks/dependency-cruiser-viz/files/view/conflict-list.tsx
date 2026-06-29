import type { LayerConflict } from '../../model';

export function ConflictList({ conflicts }: { conflicts: LayerConflict[] }) {
  if (conflicts.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="shrink-0 border-t border-border px-4 py-2">
        <span className="text-xs font-semibold text-amber-500">
          Conflicts ({conflicts.length})
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-4 pb-2">
        {conflicts.map((c, i) => (
          <div
            key={`${c.layerA}-${c.layerB}-${i}`}
            className="flex flex-col gap-0.5 text-xs text-muted-foreground"
          >
            <span className="font-medium text-amber-400">
              {c.layerA} {'<->'} {c.layerB}
            </span>
            <span className="font-mono text-[10px] opacity-70">
              {c.pathA} {'∩'} {c.pathB}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
