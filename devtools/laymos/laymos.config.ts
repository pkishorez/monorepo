import { defineConfig, edge, layer, layerGraph, module, rules } from 'laymos';

const cli = layer('cli', ['src/cli']);
const nodeApi = layer('node-api', ['src/node.ts']);
const engine = layer('engine', ['src/engine']);
const configDsl = layer('config-dsl', ['src/config', 'src/index.ts']);
const report = layer('report', ['src/report']);
const tests = layer('tests', ['test']);

const storyAdapters = layer('story-adapters', ['src/story/effect']);
const storyRuntime = layer('story-runtime', ['src/story/story-runtime']);
const storyTooling = layer('story-tooling', [
  'src/story/coverage',
  'src/story/eject',
  'src/story/runner',
]);
const storyCore = layer('story-core', ['src/story/core', 'src/story/artifact']);

const cliModule = module('src/cli');
const nodeApiModule = module('src/node.ts');

const configModule = module('src/config');
const configEntryModule = module('src/index.ts');
const reportModule = module('src/report');
const testsModule = module('test');

const engineErrorsModule = module('src/engine/errors.ts');
const extractModule = module('src/engine/1-extract');
const resolveModule = module('src/engine/2-resolve');
const evaluateModule = module('src/engine/3-evaluate');
const emitModule = module('src/engine/4-emit');

const storyArtifactModule = module('src/story/artifact');
const storyCoreModule = module('src/story/core');
const storyEffectModule = module('src/story/effect');
const storyRuntimeModule = module('src/story/story-runtime');
const storyCoverageModule = module('src/story/coverage');
const storyEjectModule = module('src/story/eject');
const storyRunnerModule = module('src/story/runner');

export default defineConfig({
  sourceRoots: ['src', 'test'],
  graphs: [
    layerGraph('tooling', [
      edge(cli, nodeApi),
      edge(nodeApi, [engine, configDsl, report, storyTooling, storyCore]),
      edge(engine, [configDsl, report]),
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
    ]),
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
    rules(configEntryModule, { canImport: [configModule] }),
    rules(configModule, {
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
