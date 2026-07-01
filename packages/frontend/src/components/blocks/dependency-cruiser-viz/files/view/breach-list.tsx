import type { FeatureClosureViolation } from '../../model';

const REASON_LABEL: Record<FeatureClosureViolation['reason'], string> = {
  'unclaimed-edge': 'unclaimed edge',
  'closure-escape': 'closure escape',
  'multi-root': 'multiple roots',
  'no-root': 'no root',
  'uncovered-file': 'uncovered file',
};

export function BreachList({
  violations,
}: {
  violations: FeatureClosureViolation[];
}) {
  if (violations.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="shrink-0 border-t border-border px-4 py-2">
        <span className="text-xs font-semibold text-red-500">
          Closure violations ({violations.length})
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-4 pb-2">
        {violations.map((v, i) => (
          <div
            key={`${v.feature}-${v.fromModule}-${v.toModule}-${i}`}
            className="flex flex-col gap-0.5 text-xs text-muted-foreground"
          >
            <span className="font-medium text-red-400">
              {v.feature ? `[${v.feature}] ` : ''}
              {v.fromModule && v.toModule
                ? `${v.fromModule} → ${v.toModule}`
                : (v.fromModule ?? v.toModule ?? '—')}
            </span>
            <span className="text-[10px] uppercase tracking-wide opacity-60">
              {REASON_LABEL[v.reason]}
            </span>
            {v.detail && (
              <span className="font-mono text-[10px] opacity-70">
                {v.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
