import type {
  Layer,
  LayerCoverageViolation,
  LayerRule,
  LayerViolationPair,
} from '../model';
import { combineLayerGraphRules, type NamedLayerGraph } from '../layer-graphs';

export const layers: readonly Layer[] = [
  {
    id: 'application',
    description: 'Coordinates user-facing workflows and application use cases.',
    scopes: [{ path: 'src/application', fileCount: 18 }],
  },
  {
    id: 'presentation',
    description: 'Owns routes, screens, and presentation-specific adapters.',
    scopes: [
      { path: 'src/web/routes', fileCount: 12 },
      { path: 'src/web/screens', fileCount: 27 },
    ],
  },
  {
    id: 'infrastructure',
    description: 'Implements persistence and external service integrations.',
    scopes: [
      { path: 'src/adapters/database', fileCount: 9 },
      { path: 'src/adapters/http', fileCount: 7 },
      { path: 'src/adapters/queue', fileCount: 4 },
    ],
  },
  {
    id: 'domain',
    description: 'Contains business rules and domain values.',
    scopes: [{ path: 'src/domain', fileCount: 31 }],
  },
  {
    id: 'foundation',
    description: 'Provides stable utilities shared by every higher layer.',
    scopes: [
      { path: 'src/shared/errors.ts', fileCount: 1 },
      { path: 'src/shared/types', fileCount: 8 },
    ],
  },
];

export const layerGraphs: readonly NamedLayerGraph[] = [
  {
    id: 'architecture',
    description: 'Application and domain boundaries.',
    rules: [
      { fromLayerId: 'application', toLayerIds: ['domain'] },
      { fromLayerId: 'presentation', toLayerIds: ['application', 'domain'] },
      { fromLayerId: 'domain', toLayerIds: ['foundation'] },
    ],
  },
  {
    id: 'integrations',
    description: 'External adapters and infrastructure boundaries.',
    rules: [
      { fromLayerId: 'application', toLayerIds: ['infrastructure'] },
      { fromLayerId: 'infrastructure', toLayerIds: ['domain', 'foundation'] },
    ],
  },
];

export const rules: readonly LayerRule[] = combineLayerGraphRules(layerGraphs);

export const violationPairs: readonly LayerViolationPair[] = [
  {
    id: 'domain-to-infrastructure',
    fromLayerId: 'domain',
    toLayerId: 'infrastructure',
    violations: [
      {
        fromFile: 'src/domain/orders/order-service.ts',
        toFile: 'src/adapters/database/order-repository.ts',
      },
      {
        fromFile: 'src/domain/users/user.ts',
        toFile: 'src/adapters/http/user-client.ts',
      },
    ],
  },
  {
    id: 'foundation-to-domain',
    fromLayerId: 'foundation',
    toLayerId: 'domain',
    violations: [
      {
        fromFile: 'src/shared/types/entity.ts',
        toFile: 'src/domain/entity.ts',
      },
    ],
  },
];

export const coverageViolations: readonly LayerCoverageViolation[] = [
  { file: 'src/legacy/compatibility.ts' },
  { file: 'src/experimental/prototype.ts' },
];
