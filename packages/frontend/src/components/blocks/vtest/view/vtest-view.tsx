import { useMemo, useState } from 'react';
import { BookOpenIcon } from 'lucide-react';

import type { VtestConfig } from '../types';
import { FeatureContent } from './feature-content';
import { parseHeadings } from './markdown-outline';
import { OnThisPage } from './on-this-page';
import { featureHealth } from './status-dot';
import { TocSidebar } from './toc-sidebar';

interface VtestViewProps {
  /** The full reader payload (DevTools `RunVtest` `available: true` branch). */
  config: VtestConfig;
}

/**
 * Pure reader view over a package's vtest documentation. Renders the three-column
 * docs-site experience — left toc sidebar, center prose with inline test-group
 * cards at their directive offsets, right "on this page" outline plus health and
 * diagnostics — from a single payload prop. No I/O: the only state is the locally
 * selected feature (and the per-card test dialog).
 */
export function VtestView({ config }: VtestViewProps) {
  const { toc, features } = config;

  const orderedNames = useMemo(() => {
    const fromToc = toc.sections.flatMap((s) => s.features);
    const known = new Set(features.map((f) => f.name));
    const ordered = fromToc.filter((n) => known.has(n));
    const seen = new Set(ordered);
    for (const f of features) if (!seen.has(f.name)) ordered.push(f.name);
    return ordered;
  }, [toc.sections, features]);

  const [selected, setSelected] = useState<string | null>(null);
  const selectedName = selected ?? orderedNames[0] ?? null;

  const featuresByName = useMemo(
    () => new Map(features.map((f) => [f.name, f])),
    [features],
  );
  const feature = selectedName
    ? (featuresByName.get(selectedName) ?? null)
    : null;

  const headings = useMemo(
    () => (feature ? parseHeadings(feature.markdown) : []),
    [feature],
  );

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-screen-2xl">
        <TocSidebar
          sections={toc.sections}
          selected={selectedName}
          onSelect={setSelected}
          healthOf={(name) => {
            const f = featuresByName.get(name);
            return f ? featureHealth(f) : 'unknown';
          }}
        />

        <main className="min-w-0 flex-1">
          {feature ? (
            <FeatureContent feature={feature} />
          ) : (
            <div className="p-10">
              <EmptyNote
                title="No features"
                detail="This package has no documented features yet."
              />
            </div>
          )}
        </main>

        {feature && (
          <OnThisPage
            headings={headings}
            health={featureHealth(feature)}
            diagnostics={feature.diagnostics}
          />
        )}
      </div>
    </div>
  );
}

function EmptyNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <BookOpenIcon className="mx-auto mb-3 size-8 text-muted-foreground/60" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
