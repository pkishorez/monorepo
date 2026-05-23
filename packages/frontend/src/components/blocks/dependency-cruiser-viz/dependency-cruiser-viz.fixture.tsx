import {
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

export default {
  simple: (
    <DependencyCruiserViz visualization={simpleConfig} summary={fullSummary} />
  ),
  full: (
    <DependencyCruiserViz visualization={fullConfig} summary={fullSummary} />
  ),
  complex: (
    <DependencyCruiserViz
      visualization={complexConfig}
      summary={complexSummary}
    />
  ),
};
