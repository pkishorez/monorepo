import { cn } from '#lib/utils';

import type { ViolationItem } from '../model/file-tree-types';

type ViolationListProps = {
  violations: ViolationItem[];
  /** When set, rows not touching this layer are dimmed (never removed). */
  activeLayer: string | null;
  selectedViolation: ViolationItem | null;
  onSelect: (violation: ViolationItem | null) => void;
};

export function ViolationList({
  violations,
  activeLayer,
  selectedViolation,
  onSelect,
}: ViolationListProps) {
  if (violations.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="shrink-0 border-t border-border px-4 py-2">
        <span className="text-xs font-semibold text-red-500">
          Violations ({violations.length})
        </span>
      </div>
      <div className="px-4 pb-2">
        <div className="flex flex-col gap-1.5">
          {violations.map((v, i) => {
            const isSelected =
              selectedViolation !== null && sameViolation(v, selectedViolation);
            const isDimmed =
              activeLayer !== null &&
              v.from !== activeLayer &&
              v.to !== activeLayer;
            return (
              <button
                type="button"
                key={`${v.fromFile}-${v.toFile}-${i}`}
                onClick={() => onSelect(v)}
                className={cn(
                  'flex flex-col gap-0.5 rounded-md border px-2 py-1 text-left text-xs text-muted-foreground transition-colors',
                  isSelected
                    ? 'border-red-500/60 bg-red-500/10'
                    : 'border-transparent hover:border-red-500/30 hover:bg-red-500/5',
                  isDimmed && 'opacity-40',
                )}
              >
                <span className="font-medium text-red-400">
                  {v.from} {'->'} {v.to}
                </span>
                <span className="font-mono text-[10px] opacity-70">
                  {v.fromFile} {'->'} {v.toFile}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function sameViolation(a: ViolationItem, b: ViolationItem): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.fromFile === b.fromFile &&
    a.toFile === b.toFile
  );
}
