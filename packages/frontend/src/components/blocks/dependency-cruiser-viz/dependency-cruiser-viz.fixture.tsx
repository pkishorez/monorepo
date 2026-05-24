import {
  feature,
  layer,
  layersTopDown,
  toVisualizationConfig,
  type VizSummary,
} from 'dependency-cruiser-viz';

import { DependencyCruiserViz } from './dependency-cruiser-viz';

const domainLayer = layer('domain', ['src/domain']);

const backend = layersTopDown('backend', [
  layer('server', ['src/server'], {
    description: 'HTTP handlers & entry point',
  }),
  layer('orchestrator', ['src/orchestrator']),
  layer('services', ['src/services']),
  domainLayer,
]);

const frontend = layersTopDown('frontend', [
  layer('routes', ['src/routes'], { description: 'Page-level UI components' }),
  domainLayer,
]);

const simpleConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [
    layersTopDown('app', [
      layer('ui', ['src/ui']),
      layer('core', ['src/core']),
    ]),
  ],
});

const fullConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [backend, frontend],
});

const dbLayer = layer('database', ['src/database']);
const configLayer = layer('config', ['src/config']);
const utilsLayer = layer('utils', ['src/utils']);

const api = layersTopDown('api', [
  layer('gateway', ['src/gateway']),
  layer('middleware', ['src/middleware']),
  layer('controllers', ['src/controllers']),
  layer('services', ['src/services']),
  layer('repositories', ['src/repositories']),
  dbLayer,
  configLayer,
]);

const web = layersTopDown('web', [
  layer('pages', ['src/pages']),
  layer('components', ['src/components']),
  layer('hooks', ['src/hooks']),
  layer('state', ['src/state']),
  utilsLayer,
  configLayer,
]);

const worker = layersTopDown('worker', [
  layer('scheduler', ['src/scheduler']),
  layer('jobs', ['src/jobs']),
  layer('queues', ['src/queues']),
  dbLayer,
  configLayer,
]);

const cli = layersTopDown('cli', [
  layer('commands', ['src/commands']),
  layer('prompts', ['src/prompts']),
  utilsLayer,
  configLayer,
]);

const complexConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [api, web, worker, cli],
});

const fullConfigWithFeatures = toVisualizationConfig({
  rootDir: 'src',
  rules: [backend, frontend],
  features: [
    feature(
      'auth',
      ['src/server/auth', 'src/services/auth', 'src/domain/identity'],
      { description: 'Authentication & session management' },
    ),
    feature(
      'orders',
      [
        'src/server/orders',
        'src/orchestrator/order-flow',
        'src/services/order-service',
        'src/domain/order',
      ],
      { description: 'Order processing pipeline' },
    ),
    feature('shared', ['src/domain/types', 'src/services/email'], {
      description: 'Shared utilities and cross-cutting concerns',
    }),
  ],
});

const complexConfigWithFeatures = toVisualizationConfig({
  rootDir: 'src',
  rules: [api, web, worker, cli],
  features: [
    feature(
      'user-management',
      [
        'src/controllers/user-controller',
        'src/services/user-service',
        'src/repositories/user-repo',
        'src/pages/settings',
        'src/hooks/use-auth',
        'src/state/store',
        'src/config/app',
      ],
      { description: 'User CRUD and profile management' },
    ),
    feature(
      'order-processing',
      [
        'src/controllers/order-controller',
        'src/services/order-service',
        'src/repositories/order-repo',
        'src/scheduler/cron',
        'src/jobs/email-job',
        'src/queues/email-queue',
        'src/config/database',
      ],
      { description: 'Order lifecycle and background processing' },
    ),
    feature(
      'shared-infra',
      [
        'src/gateway/router',
        'src/gateway/auth-guard',
        'src/middleware/cors',
        'src/middleware/logger',
        'src/database/client',
        'src/database/migrations',
        'src/config/app',
        'src/config/database',
        'src/utils/format',
        'src/utils/validate',
      ],
      { description: 'Shared infrastructure and utilities' },
    ),
  ],
});

const fullSummary: VizSummary = {
  ignoredFiles: ['src/styles.css'],
  violations: [
    {
      from: 'domain',
      to: 'server',
      fromFile: 'src/domain/user.ts',
      toFile: 'src/server/handler.ts',
      rule: 'backend: domain cannot import server',
      severity: 'error',
    },
    {
      from: 'services',
      to: 'orchestrator',
      fromFile: 'src/services/auth.ts',
      toFile: 'src/orchestrator/pipeline.ts',
      rule: 'backend: services cannot import orchestrator',
      severity: 'error',
    },
  ],
  orphanFiles: [
    'src/scripts/seed.ts',
    'src/scripts/migrate.ts',
    'src/types/global.d.ts',
    'src/utils/logger.ts',
  ],
  coveredFiles: [
    {
      layer: 'server',
      files: [
        'src/server/handler.ts',
        'src/server/middleware.ts',
        'src/server/index.ts',
      ],
    },
    {
      layer: 'orchestrator',
      files: ['src/orchestrator/pipeline.ts', 'src/orchestrator/workflow.ts'],
    },
    {
      layer: 'services',
      files: [
        'src/services/auth.ts',
        'src/services/user-service.ts',
        'src/services/email.ts',
      ],
    },
    {
      layer: 'domain',
      files: [
        'src/domain/user.ts',
        'src/domain/order.ts',
        'src/domain/types.ts',
      ],
    },
    {
      layer: 'routes',
      files: [
        'src/routes/index.tsx',
        'src/routes/login.tsx',
        'src/routes/dashboard.tsx',
      ],
    },
  ],
};

const fullSummaryWithFeatures: VizSummary = {
  ...fullSummary,
  featureViolations: [
    {
      from: 'auth',
      to: 'orders',
      fromFile: 'src/services/auth/login.ts',
      toFile: 'src/services/order-service/create.ts',
      rule: 'feature auth: cannot import src/services/order-service',
      severity: 'error',
    },
  ],
  featureCoveredFiles: [
    {
      feature: 'auth',
      files: [
        'src/server/auth/login-handler.ts',
        'src/server/auth/session.ts',
        'src/services/auth/login.ts',
        'src/services/auth/validate.ts',
        'src/domain/identity/user.ts',
      ],
    },
    {
      feature: 'orders',
      files: [
        'src/server/orders/create-handler.ts',
        'src/orchestrator/order-flow/pipeline.ts',
        'src/services/order-service/create.ts',
        'src/domain/order/order.ts',
      ],
    },
    {
      feature: 'shared',
      files: ['src/domain/types/common.ts', 'src/services/email/send.ts'],
    },
  ],
  featureFileEdges: [
    {
      from: 'src/server/auth/login-handler.ts',
      to: 'src/services/auth/login.ts',
    },
    {
      from: 'src/server/auth/login-handler.ts',
      to: 'src/server/auth/session.ts',
    },
    { from: 'src/services/auth/login.ts', to: 'src/services/auth/validate.ts' },
    { from: 'src/services/auth/login.ts', to: 'src/domain/identity/user.ts' },
    {
      from: 'src/services/auth/login.ts',
      to: 'src/services/order-service/create.ts',
    },
    {
      from: 'src/services/auth/validate.ts',
      to: 'src/domain/identity/user.ts',
    },
    { from: 'src/server/auth/session.ts', to: 'src/domain/identity/user.ts' },
    {
      from: 'src/server/orders/create-handler.ts',
      to: 'src/orchestrator/order-flow/pipeline.ts',
    },
    {
      from: 'src/orchestrator/order-flow/pipeline.ts',
      to: 'src/services/order-service/create.ts',
    },
    {
      from: 'src/services/order-service/create.ts',
      to: 'src/domain/order/order.ts',
    },
    { from: 'src/domain/types/common.ts', to: 'src/services/email/send.ts' },
  ],
};

const complexSummary: VizSummary = {
  ignoredFiles: ['src/styles.css', 'src/generated/types.ts'],
  violations: [
    {
      from: 'repositories',
      to: 'controllers',
      fromFile: 'src/repositories/user-repo.ts',
      toFile: 'src/controllers/user-controller.ts',
      rule: 'api: repositories cannot import controllers',
      severity: 'error',
    },
    {
      from: 'state',
      to: 'pages',
      fromFile: 'src/state/store.ts',
      toFile: 'src/pages/home.tsx',
      rule: 'web: state cannot import pages',
      severity: 'error',
    },
    {
      from: 'queues',
      to: 'scheduler',
      fromFile: 'src/queues/email-queue.ts',
      toFile: 'src/scheduler/cron.ts',
      rule: 'worker: queues cannot import scheduler',
      severity: 'warn',
    },
  ],
  orphanFiles: [
    'src/scripts/deploy.ts',
    'src/scripts/seed.ts',
    'src/types/env.d.ts',
    'src/constants/index.ts',
    'src/constants/errors.ts',
  ],
  coveredFiles: [
    {
      layer: 'gateway',
      files: ['src/gateway/router.ts', 'src/gateway/auth-guard.ts'],
    },
    {
      layer: 'middleware',
      files: ['src/middleware/cors.ts', 'src/middleware/logger.ts'],
    },
    {
      layer: 'controllers',
      files: [
        'src/controllers/user-controller.ts',
        'src/controllers/order-controller.ts',
      ],
    },
    {
      layer: 'services',
      files: ['src/services/user-service.ts', 'src/services/order-service.ts'],
    },
    {
      layer: 'repositories',
      files: [
        'src/repositories/user-repo.ts',
        'src/repositories/order-repo.ts',
      ],
    },
    {
      layer: 'database',
      files: ['src/database/client.ts', 'src/database/migrations.ts'],
    },
    {
      layer: 'config',
      files: ['src/config/app.ts', 'src/config/database.ts'],
    },
    {
      layer: 'pages',
      files: ['src/pages/home.tsx', 'src/pages/settings.tsx'],
    },
    {
      layer: 'components',
      files: [
        'src/components/header.tsx',
        'src/components/sidebar.tsx',
        'src/components/footer.tsx',
      ],
    },
    { layer: 'hooks', files: ['src/hooks/use-auth.ts'] },
    { layer: 'state', files: ['src/state/store.ts', 'src/state/slices.ts'] },
    { layer: 'utils', files: ['src/utils/format.ts', 'src/utils/validate.ts'] },
    {
      layer: 'scheduler',
      files: ['src/scheduler/cron.ts', 'src/scheduler/runner.ts'],
    },
    {
      layer: 'jobs',
      files: ['src/jobs/email-job.ts', 'src/jobs/cleanup-job.ts'],
    },
    { layer: 'queues', files: ['src/queues/email-queue.ts'] },
    {
      layer: 'commands',
      files: ['src/commands/init.ts', 'src/commands/migrate.ts'],
    },
    { layer: 'prompts', files: ['src/prompts/confirm.ts'] },
  ],
};

const complexSummaryWithFeatures: VizSummary = {
  ...complexSummary,
  featureViolations: [
    {
      from: 'user-management',
      to: 'order-processing',
      fromFile: 'src/services/user-service.ts',
      toFile: 'src/services/order-service.ts',
      rule: 'feature user-management: cannot import src/services/order-service',
      severity: 'error',
    },
    {
      from: 'order-processing',
      to: 'user-management',
      fromFile: 'src/repositories/order-repo.ts',
      toFile: 'src/repositories/user-repo.ts',
      rule: 'feature order-processing: cannot import src/repositories/user-repo',
      severity: 'error',
    },
  ],
  featureCoveredFiles: [
    {
      feature: 'user-management',
      files: [
        'src/controllers/user-controller.ts',
        'src/services/user-service.ts',
        'src/repositories/user-repo.ts',
        'src/pages/settings.tsx',
        'src/hooks/use-auth.ts',
        'src/state/store.ts',
        'src/config/app.ts',
      ],
    },
    {
      feature: 'order-processing',
      files: [
        'src/controllers/order-controller.ts',
        'src/services/order-service.ts',
        'src/repositories/order-repo.ts',
        'src/scheduler/cron.ts',
        'src/jobs/email-job.ts',
        'src/queues/email-queue.ts',
        'src/config/database.ts',
      ],
    },
    {
      feature: 'shared-infra',
      files: [
        'src/gateway/router.ts',
        'src/gateway/auth-guard.ts',
        'src/middleware/cors.ts',
        'src/middleware/logger.ts',
        'src/database/client.ts',
        'src/database/migrations.ts',
        'src/config/app.ts',
        'src/config/database.ts',
        'src/utils/format.ts',
        'src/utils/validate.ts',
      ],
    },
  ],
  featureFileEdges: [
    {
      from: 'src/controllers/user-controller.ts',
      to: 'src/services/user-service.ts',
    },
    {
      from: 'src/services/user-service.ts',
      to: 'src/repositories/user-repo.ts',
    },
    {
      from: 'src/services/user-service.ts',
      to: 'src/services/order-service.ts',
    },
    { from: 'src/services/user-service.ts', to: 'src/config/app.ts' },
    { from: 'src/pages/settings.tsx', to: 'src/hooks/use-auth.ts' },
    { from: 'src/pages/settings.tsx', to: 'src/state/store.ts' },
    { from: 'src/hooks/use-auth.ts', to: 'src/config/app.ts' },
    {
      from: 'src/controllers/order-controller.ts',
      to: 'src/services/order-service.ts',
    },
    {
      from: 'src/services/order-service.ts',
      to: 'src/repositories/order-repo.ts',
    },
    {
      from: 'src/repositories/order-repo.ts',
      to: 'src/repositories/user-repo.ts',
    },
    { from: 'src/repositories/order-repo.ts', to: 'src/config/database.ts' },
    { from: 'src/scheduler/cron.ts', to: 'src/jobs/email-job.ts' },
    { from: 'src/jobs/email-job.ts', to: 'src/queues/email-queue.ts' },
    { from: 'src/gateway/router.ts', to: 'src/gateway/auth-guard.ts' },
    { from: 'src/gateway/router.ts', to: 'src/middleware/cors.ts' },
    { from: 'src/gateway/auth-guard.ts', to: 'src/middleware/logger.ts' },
    { from: 'src/database/client.ts', to: 'src/config/database.ts' },
    { from: 'src/database/migrations.ts', to: 'src/database/client.ts' },
    { from: 'src/utils/validate.ts', to: 'src/utils/format.ts' },
  ],
};

export default {
  simple: <DependencyCruiserViz config={simpleConfig} summary={fullSummary} />,
  'graph-only': <DependencyCruiserViz config={fullConfig} />,
  full: <DependencyCruiserViz config={fullConfig} summary={fullSummary} />,
  complex: (
    <DependencyCruiserViz config={complexConfig} summary={complexSummary} />
  ),
  'with-features': (
    <DependencyCruiserViz
      config={fullConfigWithFeatures}
      summary={fullSummaryWithFeatures}
    />
  ),
  'complex-with-features': (
    <DependencyCruiserViz
      config={complexConfigWithFeatures}
      summary={complexSummaryWithFeatures}
    />
  ),
};
