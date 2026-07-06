import {
  edge,
  layer,
  layerGraph,
  toVisualizationConfig,
  type VizSummary,
} from 'depcruise-viz';
import { DevtoolsReport } from './devtools-report';

const routes = layer('routes', ['src/routes'], {
  description: 'Page-level UI',
});
const services = layer('services', ['src/services']);
const domain = layer('domain', ['src/domain']);

const depcruiseConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [layerGraph('app', [edge(routes, services), edge(services, domain)])],
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
  emptyModules: [],
  conflicts: [],
  moduleOverlaps: [],
  moduleEdges: [],
  moduleViolations: [],
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
  emptyModules: [],
  conflicts: [],
};

const report = (
  depcruise: { config: typeof depcruiseConfig; summary: VizSummary } | null,
): unknown => ({
  depcruise: depcruise
    ? { available: true, data: depcruise }
    : { available: false },
});

export default {
  clean: (
    <DevtoolsReport
      report={report({ config: depcruiseConfig, summary: cleanSummary })}
    />
  ),
  violations: (
    <DevtoolsReport
      report={report({ config: depcruiseConfig, summary: dirtySummary })}
      onClose={() => console.log('close')}
    />
  ),
  empty: <DevtoolsReport report={report(null)} />,
  'malformed input': <DevtoolsReport report="not a report" />,
};
