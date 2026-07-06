import type { ModuleOverlap } from '../../model';

/**
 * Hierarchical module declarations reported as violations: modules must be
 * exhaustive and mutually exclusive, so an outer module whose path contains an
 * inner one silently splits files away from it.
 */
export function ModuleOverlapList({ overlaps }: { overlaps: ModuleOverlap[] }) {
  if (overlaps.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="shrink-0 border-t border-border px-4 py-2">
        <span className="text-xs font-semibold text-destructive">
          Overlapping modules ({overlaps.length})
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-4 pb-2">
        {overlaps.map((o, i) => (
          <div
            key={`${o.outerPath}-${o.innerPath}-${i}`}
            className="flex flex-col gap-0.5 text-xs text-muted-foreground"
          >
            <span className="font-medium text-destructive">
              {o.innerName} nests inside {o.outerName}
            </span>
            <span className="font-mono text-[10px] opacity-70">
              {o.innerPath} {'⊂'} {o.outerPath}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
