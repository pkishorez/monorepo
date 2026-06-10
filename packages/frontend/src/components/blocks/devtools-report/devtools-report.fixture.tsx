import {
  layer,
  layersTopDown,
  toVisualizationConfig,
  type VizSummary,
} from 'dependency-cruiser-viz';
import { config as vtestConfig } from '../vtest/fixtures';
import type { TestStatus, VtestConfig } from '../vtest';
import { DevtoolsReport } from './devtools-report';

/** Rewrite every test's status, to synthesise run-outcome variants. */
const withStatuses = (
  config: VtestConfig,
  map: (status: TestStatus) => TestStatus,
): VtestConfig => ({
  ...config,
  features: config.features.map((feature) => ({
    ...feature,
    groups: feature.groups.map((group) => ({
      ...group,
      tests: group.tests.map((test) => ({ ...test, status: map(test.status) })),
    })),
  })),
});

const allPassing = withStatuses(vtestConfig, () => 'pass');
const notRun = withStatuses(vtestConfig, () => 'pending');

const depcruiseConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [
    layersTopDown('app', [
      layer('routes', ['src/routes'], { description: 'Page-level UI' }),
      layer('services', ['src/services']),
      layer('domain', ['src/domain']),
    ]),
  ],
});

const cleanSummary: VizSummary = {
  ignoredFiles: [],
  violations: [],
  layerOrphanFiles: [],
  coveredFiles: [
    { layer: 'routes', files: ['src/routes/index.tsx'] },
    { layer: 'services', files: ['src/services/auth.ts'] },
    { layer: 'domain', files: ['src/domain/user.ts', 'src/domain/order.ts'] },
  ],
  moduleCoverage: [],
  coverageGaps: [],
  breaches: [],
  featureEdges: [],
  featureModuleEdges: [],
};

const dirtySummary: VizSummary = {
  ...cleanSummary,
  violations: [
    {
      from: 'domain',
      to: 'routes',
      fromFile: 'src/domain/user.ts',
      toFile: 'src/routes/index.tsx',
      rule: 'app: domain cannot import routes',
      severity: 'error',
    },
  ],
  coverageGaps: ['src/services/email.ts'],
};

const report = (
  vtest: VtestConfig | null,
  depcruise: { config: typeof depcruiseConfig; summary: VizSummary } | null,
): unknown => ({
  vtest: vtest ? { available: true, ...vtest } : { available: false },
  depcruise: depcruise
    ? { available: true, data: depcruise }
    : { available: false },
});

export default {
  'passing + clean': (
    <DevtoolsReport
      report={report(allPassing, {
        config: depcruiseConfig,
        summary: cleanSummary,
      })}
    />
  ),
  'failing + violations': (
    <DevtoolsReport
      report={report(vtestConfig, {
        config: depcruiseConfig,
        summary: dirtySummary,
      })}
      onClose={() => console.log('close')}
    />
  ),
  'not run': (
    <DevtoolsReport
      report={report(notRun, {
        config: depcruiseConfig,
        summary: cleanSummary,
      })}
    />
  ),
  'vtest only': <DevtoolsReport report={report(allPassing, null)} />,
  'depcruise only': (
    <DevtoolsReport
      report={report(null, { config: depcruiseConfig, summary: dirtySummary })}
    />
  ),
  empty: <DevtoolsReport report={report(null, null)} />,
  'malformed input': <DevtoolsReport report="not a report" />,
};
