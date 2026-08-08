import type {
  Layer,
  LayerCoverageViolation,
  LayerRule,
  LayerViolationPair,
} from '../model';
import { combineLayerGraphRules, type NamedLayerGraph } from '../layer-graphs';

export const complexLayers: readonly Layer[] = [
  layer('web-client', 'Browser routes and web-specific navigation.', [
    ['apps/web/routes', 34],
  ]),
  layer('mobile-client', 'Native screens and mobile navigation.', [
    ['apps/mobile/screens', 29],
  ]),
  layer('partner-api', 'Public endpoints used by commerce partners.', [
    ['services/partners/http', 16],
  ]),
  layer('app-shell', 'Shared presentation workflows across clients.', [
    ['packages/experience/shell', 22],
    ['packages/experience/navigation', 8],
  ]),
  layer('commerce-app', 'Coordinates catalog and ordering use cases.', [
    ['packages/commerce/application', 35],
    ['services/commerce/workflows', 6],
  ]),
  layer('commerce-domain', 'Business rules for products and orders.', [
    ['packages/commerce/domain', 57],
    ['packages/commerce/shared-domain', 11],
  ]),
  layer('commerce-kernel', 'Stable commerce values and contracts.', [
    ['packages/commerce/kernel', 18],
  ]),
  layer('scheduler', 'Starts recurring operational workflows.', [
    ['services/operations/scheduler', 12],
  ]),
  layer('webhook-ingress', 'Receives external operational events.', [
    ['services/operations/webhooks', 19],
  ]),
  layer('operator-console', 'Internal tools for support operators.', [
    ['apps/operator-console', 38],
  ]),
  layer('automation', 'Normalizes triggers into executable work.', [
    ['packages/operations/automation', 26],
  ]),
  layer('job-runtime', 'Executes and observes background jobs.', [
    ['packages/operations/runtime', 45],
  ]),
  layer('platform-kernel', 'Shared operational primitives.', [
    ['packages/platform/kernel', 21],
  ]),
  layer('stream-consumer', 'Consumes real-time product events.', [
    ['services/insights/stream', 23],
  ]),
  layer('batch-importer', 'Imports historical data sets.', [
    ['services/insights/importer', 14],
  ]),
  layer('analyst-portal', 'Interactive reporting for analysts.', [
    ['apps/analyst-portal', 31],
  ]),
  layer('analytics-pipeline', 'Transforms events into queryable facts.', [
    ['packages/insights/pipeline', 48],
  ]),
  layer('query-service', 'Serves curated analytical queries.', [
    ['packages/insights/query', 27],
  ]),
  layer('data-contracts', 'Canonical schemas shared by analytics.', [
    ['packages/insights/contracts', 20],
  ]),
];

export const complexLayerGraphs: readonly NamedLayerGraph[] = [
  {
    id: 'customer-experience',
    description: 'Three entry points converge on the commerce domain.',
    rules: [
      { fromLayerId: 'web-client', toLayerIds: ['app-shell'] },
      { fromLayerId: 'mobile-client', toLayerIds: ['app-shell'] },
      { fromLayerId: 'partner-api', toLayerIds: ['commerce-app'] },
      { fromLayerId: 'app-shell', toLayerIds: ['commerce-app'] },
      { fromLayerId: 'commerce-app', toLayerIds: ['commerce-domain'] },
      { fromLayerId: 'commerce-domain', toLayerIds: ['commerce-kernel'] },
    ],
  },
  {
    id: 'operations',
    description: 'Automated and human roots meet at the job runtime.',
    rules: [
      { fromLayerId: 'scheduler', toLayerIds: ['automation'] },
      { fromLayerId: 'webhook-ingress', toLayerIds: ['automation'] },
      { fromLayerId: 'operator-console', toLayerIds: ['job-runtime'] },
      { fromLayerId: 'automation', toLayerIds: ['job-runtime'] },
      { fromLayerId: 'job-runtime', toLayerIds: ['platform-kernel'] },
    ],
  },
  {
    id: 'insights',
    description: 'Independent ingestion and query paths share data contracts.',
    rules: [
      { fromLayerId: 'stream-consumer', toLayerIds: ['analytics-pipeline'] },
      { fromLayerId: 'batch-importer', toLayerIds: ['analytics-pipeline'] },
      { fromLayerId: 'analyst-portal', toLayerIds: ['query-service'] },
      { fromLayerId: 'analytics-pipeline', toLayerIds: ['data-contracts'] },
      { fromLayerId: 'query-service', toLayerIds: ['data-contracts'] },
    ],
  },
];

export const complexRules: readonly LayerRule[] =
  combineLayerGraphRules(complexLayerGraphs);

export const complexViolationPairs: readonly LayerViolationPair[] = [
  {
    id: 'commerce-domain-to-app',
    fromLayerId: 'commerce-domain',
    toLayerId: 'commerce-app',
    violations: [
      {
        fromFile: 'packages/commerce/domain/orders/order.ts',
        toFile: 'packages/commerce/application/create-order.ts',
      },
      {
        fromFile: 'packages/commerce/domain/catalog/product.ts',
        toFile: 'packages/commerce/application/update-catalog.ts',
      },
    ],
  },
  {
    id: 'platform-kernel-to-runtime',
    fromLayerId: 'platform-kernel',
    toLayerId: 'job-runtime',
    violations: [
      {
        fromFile: 'packages/platform/kernel/job-id.ts',
        toFile: 'packages/operations/runtime/job-runner.ts',
      },
    ],
  },
  {
    id: 'contracts-to-pipeline',
    fromLayerId: 'data-contracts',
    toLayerId: 'analytics-pipeline',
    violations: [
      {
        fromFile: 'packages/insights/contracts/event.ts',
        toFile: 'packages/insights/pipeline/normalize-event.ts',
      },
    ],
  },
];

export const complexCoverageViolations: readonly LayerCoverageViolation[] = [
  { file: 'packages/legacy/export-report.ts' },
];

function layer(
  id: string,
  description: string,
  scopes: readonly (readonly [path: string, fileCount: number])[],
): Layer {
  return {
    id,
    description,
    scopes: scopes.map(([path, fileCount]) => ({ path, fileCount })),
  };
}
