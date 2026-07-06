import type { ModuleViolation } from '../../model';

const RULE_LABEL: Record<ModuleViolation['rule'], string> = {
  root: 'root',
  leaf: 'leaf',
  onlyImports: 'only-imports',
  onlyImportedBy: 'only-imported-by',
};

/**
 * Cross-module imports that break a rule declared on a module (root, leaf,
 * onlyImports, onlyImportedBy), with the offending file-level edge.
 */
export function ModuleViolationList({
  violations,
}: {
  violations: ModuleViolation[];
}) {
  if (violations.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="shrink-0 border-t border-border px-4 py-2">
        <span className="text-xs font-semibold text-destructive">
          Rule violations ({violations.length})
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-4 pb-2">
        {violations.map((v, i) => (
          <div
            key={`${v.module}-${v.fromFile}-${v.toFile}-${i}`}
            className="flex flex-col gap-0.5 text-xs text-muted-foreground"
          >
            <span className="font-medium text-destructive">
              [{RULE_LABEL[v.rule]}] {v.module}: {v.from} {'→'} {v.to}
            </span>
            <span className="font-mono text-[10px] opacity-70">
              {v.fromFile} {'→'} {v.toFile}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
