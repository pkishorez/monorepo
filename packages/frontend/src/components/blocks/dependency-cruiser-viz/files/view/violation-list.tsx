import type { ViolationItem } from '../model/file-tree-types';

export function ViolationList({ violations }: { violations: ViolationItem[] }) {
  if (violations.length === 0) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-t border-border px-4 py-2">
        <span className="text-xs font-semibold text-red-500">
          Violations ({violations.length})
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-2">
        <div className="flex flex-col gap-1.5">
          {violations.map((v, i) => (
            <div
              key={`${v.fromFile}-${v.toFile}-${i}`}
              className="flex flex-col gap-0.5 text-xs text-muted-foreground"
            >
              <span className="font-medium text-red-400">
                {v.from} {'->'} {v.to}
              </span>
              <span className="font-mono text-[10px] opacity-70">
                {v.fromFile} {'->'} {v.toFile}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
