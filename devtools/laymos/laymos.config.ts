import { defineConfig, edge, layer, layerGraph, module, rules } from 'laymos';

const cli = layer('cli', ['src/cli'], { description: 'CLI commands' });
const nodeApi = layer('node-api', ['src/node.ts'], {
  description: 'Node.js API',
});
const engine = layer('engine', ['src/engine'], {
  description: 'Static architecture analysis',
});
const configDsl = layer('config-dsl', ['src/config', 'src/index.ts'], {
  description: 'Public architecture configuration',
});
const report = layer('report', ['src/report'], {
  description: 'Serializable analysis reports',
});
const tests = layer('tests', ['test'], { description: 'Package tests' });

const storyAdapters = layer('story-adapters', ['src/story/effect'], {
  description: 'Effect Story authoring adapter',
});
const storyRuntime = layer('story-runtime', ['src/story/story-runtime'], {
  description: 'Story runtime implementation',
});
const storyTooling = layer(
  'story-tooling',
  ['src/story/coverage', 'src/story/eject', 'src/story/runner'],
  { description: 'Story inspection and maintenance tools' },
);
const storyCore = layer(
  'story-core',
  ['src/story/core', 'src/story/artifact'],
  {
    description: 'Shared Story domain',
  },
);

const cliModule = module('src/cli', { description: 'CLI commands' });
const nodeApiModule = module('src/node.ts', { description: 'Node.js API' });

const configModule = module('src/config', { description: 'Config DSL' });
const configEntryModule = module('src/index.ts', {
  description: 'Public package entrypoint',
});
const reportModule = module('src/report', { description: 'Report types' });
const testsModule = module('test', { description: 'Package tests' });

const engineErrorsModule = module('src/engine/errors.ts', {
  description: 'Engine errors',
});
const extractModule = module('src/engine/1-extract', {
  description: 'Source extraction',
});
const resolveModule = module('src/engine/2-resolve', {
  description: 'Architecture resolution',
});
const evaluateModule = module('src/engine/3-evaluate', {
  description: 'Rule evaluation',
});
const emitModule = module('src/engine/4-emit', {
  description: 'Report emission',
});

const storyArtifactModule = module('src/story/artifact', {
  description: 'Serializable Story artifacts',
});
const storyCoreModule = module('src/story/core', {
  description: 'Story domain',
});
const storyEffectModule = module('src/story/effect', {
  description: 'Effect Story authoring',
});
const storyRuntimeModule = module('src/story/story-runtime', {
  description: 'Story runtime',
});
const storyCoverageModule = module('src/story/coverage', {
  description: 'Story coverage',
});
const storyEjectModule = module('src/story/eject', {
  description: 'Story ejection',
});
const storyRunnerModule = module('src/story/runner', {
  description: 'Story discovery and execution',
});

export default defineConfig({
  sourceRoots: ['src', 'test'],
  graphs: [
    layerGraph(
      'tooling',
      [
        edge(cli, nodeApi),
        edge(nodeApi, [engine, configDsl, report, storyTooling, storyCore]),
        edge(engine, [configDsl, report]),
        edge(configDsl, storyCore),
        edge(report, storyCore),
        edge(storyAdapters, storyCore),
        edge(storyRuntime, storyCore),
        edge(storyTooling, [report, storyCore]),
        edge(tests, [
          nodeApi,
          engine,
          configDsl,
          report,
          storyAdapters,
          storyTooling,
          storyCore,
        ]),
      ],
      { description: 'Laymos package architecture' },
    ),
  ],
  modules: [
    cliModule,
    nodeApiModule,
    configModule,
    configEntryModule,
    reportModule,
    testsModule,
    engineErrorsModule,
    extractModule,
    resolveModule,
    evaluateModule,
    emitModule,
    storyArtifactModule,
    storyCoreModule,
    storyEffectModule,
    storyRuntimeModule,
    storyCoverageModule,
    storyEjectModule,
    storyRunnerModule,
  ],
  moduleRules: [
    rules(configEntryModule, { canImport: [configModule, storyCoreModule] }),
    rules(configModule, {
      canImport: [storyCoreModule],
      canImportedBy: [
        configEntryModule,
        nodeApiModule,
        extractModule,
        resolveModule,
        emitModule,
        testsModule,
      ],
    }),
    rules(engineErrorsModule, {
      canImportedBy: [nodeApiModule, extractModule],
    }),
    rules(extractModule, {
      canImport: [configModule, engineErrorsModule],
      canImportedBy: [nodeApiModule, resolveModule, testsModule],
    }),
    rules(resolveModule, {
      canImport: [configModule, extractModule],
      canImportedBy: [nodeApiModule, evaluateModule, emitModule, testsModule],
    }),
    rules(evaluateModule, {
      canImport: [resolveModule, reportModule],
      canImportedBy: [nodeApiModule, emitModule, testsModule],
    }),
    rules(emitModule, {
      canImport: [configModule, reportModule, resolveModule, evaluateModule],
    }),
    rules(storyArtifactModule, { canImport: [storyCoreModule] }),
    rules(storyCoreModule, { canImport: [] }),
    rules(storyEffectModule, { canImport: [storyCoreModule] }),
    rules(storyRuntimeModule, {
      canImport: [storyCoreModule, storyArtifactModule],
    }),
    rules(storyCoverageModule, {
      canImport: [reportModule, storyEjectModule],
    }),
    rules(storyEjectModule, { canImport: [] }),
    rules(storyRunnerModule, {
      canImport: [
        storyCoreModule,
        storyArtifactModule,
        reportModule,
        storyEjectModule,
      ],
    }),
  ],
});
