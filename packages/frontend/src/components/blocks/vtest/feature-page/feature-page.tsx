import { useMemo, useState } from 'react';

import { RotateCwIcon } from 'lucide-react';

import { Button } from '#components/ui/button';

import { splitFeature, type FeatureTopic } from '../feature-model';
import { HealthBadge } from '../health-badge';
import { Markdown } from '../markdown';
import type { TestStatus, VtestFeature, VtestHealth } from '../types';
import { DiagnosticsNote } from './diagnostics-note';
import { TopicToc } from './topic-toc';
import { TopicView } from './topic-view';

/**
 * Live wiring supplied by the route: per-group / per-test status read from the
 * streamed react-db collection, run callbacks (group + single test), and a
 * global reload. All optional so the page also renders inert from static props.
 */
export interface VtestLiveControls {
  /** Live roll-up status for a group. */
  groupStatus?: (groupId: string) => TestStatus | undefined;
  /** Run a whole group. */
  onRunGroup?: (groupId: string) => void;
  /** Live status for a single test inside a group. */
  testStatus?: (groupId: string, name: string) => TestStatus | undefined;
  /** Run a single test inside a group. */
  onRunTest?: (groupId: string, name: string) => void;
  /** Re-run everything and re-validate (the global Reload). */
  onReload?: () => void;
  /** Whether a reload is currently in flight. */
  reloadPending?: boolean;
}

interface VtestFeaturePageProps extends VtestLiveControls {
  feature: VtestFeature;
  /** Roll-up health for the per-feature badge. */
  health?: VtestHealth;
}

/**
 * Feature screen: a full page for one folder that reveals one topic at a time.
 * Starts on overview + an in-page table of contents; selecting a topic reveals
 * just that topic's markdown with live `<TestGroup>` placeholders. A global
 * Reload re-runs everything; the health badge reflects live diagnostics.
 */
export function VtestFeaturePage({
  feature,
  health = 'unknown',
  groupStatus,
  onRunGroup,
  testStatus,
  onRunTest,
  onReload,
  reloadPending,
}: VtestFeaturePageProps) {
  const { overview, topics } = useMemo(() => splitFeature(feature), [feature]);
  const [selected, setSelected] = useState<FeatureTopic | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{feature.name}</h1>
        <div className="flex items-center gap-3">
          <HealthBadge health={health} />
          {onReload && (
            <Button
              variant="outline"
              size="sm"
              disabled={reloadPending}
              onClick={onReload}
            >
              <RotateCwIcon
                className={`size-4 ${reloadPending ? 'animate-spin' : ''}`}
              />
              Reload
            </Button>
          )}
        </div>
      </header>

      <DiagnosticsNote diagnostics={feature.diagnostics} />

      {selected ? (
        <TopicView
          topic={selected}
          onBack={() => setSelected(null)}
          groupStatus={groupStatus}
          onRunGroup={onRunGroup}
          testStatus={testStatus}
          onRunTest={onRunTest}
        />
      ) : (
        <>
          {overview.markdown.length > 0 && (
            <section className="rounded-lg border border-border p-5">
              <Markdown source={overview.markdown} />
            </section>
          )}
          {topics.length > 0 && (
            <TopicToc topics={topics} onSelect={setSelected} />
          )}
        </>
      )}
    </div>
  );
}
