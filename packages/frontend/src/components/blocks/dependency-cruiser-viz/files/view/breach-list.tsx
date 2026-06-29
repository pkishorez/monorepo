import type { Breach } from '../../model';

const REASON_LABEL: Record<Breach['reason'], string> = {
  'private-cross-feature': 'private · cross-feature',
  'not-in-shared-with': 'shared · not in sharedWith',
  'infra-to-owned': 'infra → owned',
};

export function BreachList({ breaches }: { breaches: Breach[] }) {
  if (breaches.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="shrink-0 border-t border-border px-4 py-2">
        <span className="text-xs font-semibold text-red-500">
          Breaches ({breaches.length})
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-4 pb-2">
        {breaches.map((b, i) => (
          <div
            key={`${b.fromFile}-${b.toFile}-${i}`}
            className="flex flex-col gap-0.5 text-xs text-muted-foreground"
          >
            <span className="font-medium text-red-400">
              {b.fromModule} ({b.fromFeature ?? 'infra'}) {'->'} {b.toModule} (
              {b.toFeature ?? 'infra'} · {b.toVisibility})
            </span>
            <span className="text-[10px] uppercase tracking-wide opacity-60">
              {REASON_LABEL[b.reason]}
            </span>
            <span className="font-mono text-[10px] opacity-70">
              {b.fromFile} {'->'} {b.toFile}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
