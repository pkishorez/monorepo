import {
  defineConfig,
  edge,
  layer,
  layerGraph,
  markdown,
  module,
  type MarkdownContent,
} from 'laymos';

import { project } from './laymos.project.js';

interface ModuleDocumentation {
  readonly purpose: string;
  readonly contract: string;
  readonly failure: string;
  readonly dependencies: string;
  readonly place: string;
}

const documentation = ({
  purpose,
  contract,
  failure,
  dependencies,
  place,
}: ModuleDocumentation): MarkdownContent => markdown`
  ## Purpose

  ${purpose}

  ## Contract

  ${contract}

  ## Failure

  ${failure}

  ## Dependencies

  ${dependencies}

  ## Place in Laymos

  ${place}
`;

const entrypoints = layer('entrypoints', ['src/entrypoints'], {
  description: 'Public Node, CLI, and report boundaries',
});
const architecture = layer('architecture', ['src/architecture'], {
  description: 'Static project analysis pipeline',
});
const storyTooling = layer(
  'story-tooling',
  [
    'src/stories/discover-stories',
    'src/stories/inspect-story-source',
    'src/stories/measure-story-coverage',
    'src/stories/run-stories',
  ],
  { description: 'Story discovery, inspection, execution, and maintenance' },
);
const storyRuntime = layer(
  'story-runtime',
  ['src/stories/authoring', 'src/stories/runtime'],
  { description: 'Story authoring language and recording runtime' },
);
const testTooling = layer('test-tooling', ['src/tests/run-tests'], {
  description: 'Test discovery and execution',
});
const testRuntime = layer('test-runtime', ['src/tests/authoring'], {
  description: 'Test authoring language',
});
const report = layer('report', ['src/report'], {
  description: 'Serializable architecture, Story, and Test reports',
});
const config = layer('config', ['src/config', 'src/index.ts'], {
  description: 'Configuration model, validation, and loading',
});
const foundation = layer('foundation', ['src/markdown'], {
  description: 'Shared browser-safe Markdown value primitives',
});

const cliEntrypoint = module('src/entrypoints/cli', {
  description: 'CLI entrypoint',
  documentation: documentation({
    purpose:
      'Turns terminal commands into calls to the public Laymos operations.',
    contract:
      'Parse command input, run one operation, render its result, and select the process exit status.',
    failure:
      'Render typed operation failures for a human and terminate with a non-zero status.',
    dependencies:
      'Uses the Node entrypoint for operations and the report model for rendering.',
    place:
      'It is one of the three consumers of Laymos and contains no analysis rules of its own.',
  }),
});
const nodeEntrypoint = module('src/entrypoints/node', {
  description: 'Node API entrypoint',
  documentation: documentation({
    purpose:
      'Provides the programmatic API used by DevTools and other Node consumers.',
    contract:
      'Accept project-scoped request objects and return Effects with typed failures and no service requirements.',
    failure:
      'Preserve the typed failure of the operation stage that could not complete.',
    dependencies:
      'Coordinates architecture, Story, and Test modules and supplies the live Node services they require.',
    place: 'It is the narrow public door to all fallible Laymos behavior.',
  }),
});
const reportEntrypoint = module('src/entrypoints/report', {
  description: 'Report API entrypoint',
  documentation: documentation({
    purpose:
      'Exports the serializable data contracts consumed by visual tools.',
    contract:
      'Expose data-only architecture, Story, coverage, and Project Narrative types.',
    failure: 'It performs no work and therefore has no runtime failure.',
    dependencies: 'Re-exports the internal report model.',
    place:
      'It keeps report consumers independent from analysis and Story execution code.',
  }),
});
const analyzeProject = module('src/architecture/analyze-project', {
  description: 'Project analysis orchestration',
  documentation: documentation({
    purpose:
      'Coordinates the complete static analysis journey for one project.',
    contract:
      'Load configuration, locate Laymos surfaces, extract dependencies, resolve ownership, validate rules, and build one report.',
    failure:
      'Return the typed configuration or extraction failure that stopped the journey; violations remain successful report data.',
    dependencies:
      'Composes every other architecture stage and Laymos surface discovery.',
    place:
      'It is the top-level architecture Story exposed through analyzeProject.',
  }),
});
const architectureErrors = module('src/architecture/errors.ts', {
  description: 'Architecture failure model',
  documentation: documentation({
    purpose:
      'Defines the typed failures that can stop the static analysis journey.',
    contract:
      'Expose a closed LaymosError union composed from configuration and extraction stage errors.',
    failure: 'It is a data contract and performs no runtime work.',
    dependencies:
      'References the failure types owned by their operation stages.',
    place:
      'It gives analyzeProject one precise error channel without erasing which stage failed.',
  }),
});
const extractDependencies = module('src/architecture/extract-dependencies', {
  description: 'Source inventory and dependency extraction',
  documentation: documentation({
    purpose:
      'Walks configured source roots and asks skott for the imports between project files.',
    contract:
      'Return a deterministic internal file graph while excluding ignored and Laymos-surface source.',
    failure:
      'Return ExtractError when source inventory or dependency extraction cannot complete.',
    dependencies:
      'Uses configuration paths, discovered Laymos surfaces, the file system, and skott.',
    place:
      'It converts the physical codebase into the factual input used by architecture resolution.',
  }),
});
const resolveArchitecture = module('src/architecture/resolve-architecture', {
  description: 'Architecture ownership resolution',
  documentation: documentation({
    purpose:
      'Assigns extracted files and imports to their declared Layers and Modules.',
    contract:
      'Produce one resolved project with ownership, reachability, uncovered files, and ignored files made explicit.',
    failure:
      'The stage is deterministic after validated configuration and returns no expected failure.',
    dependencies: 'Uses the validated configuration and extracted file graph.',
    place:
      'It joins declared intent with the codebase facts before rules are checked.',
  }),
});
const validateRules = module('src/architecture/validate-rules', {
  description: 'Architecture rule validation',
  documentation: documentation({
    purpose:
      'Checks resolved imports against Layer reachability and Module constraints.',
    contract:
      'Return violations and coverage as data without failing the Effect.',
    failure:
      'Expected architecture problems are report data; only a programming defect can abort this pure stage.',
    dependencies: 'Uses only the resolved project.',
    place:
      'It answers which actual imports disagree with the configured architecture.',
  }),
});
const buildReport = module('src/architecture/build-report', {
  description: 'Architecture report construction',
  documentation: documentation({
    purpose: 'Creates the canonical serializable result of static analysis.',
    contract:
      'Combine declarations, resolved files, violations, coverage, warnings, and Module documentation.',
    failure: 'It is a pure projection and has no expected failure.',
    dependencies:
      'Uses the resolved project, rule validation result, and report contracts.',
    place: 'It is the final architecture stage shared by the CLI and DevTools.',
  }),
});
const configuration = module('src/config', {
  description: 'Configuration definition and loading',
  documentation: documentation({
    purpose:
      'Defines architectural intent, validates it, and loads laymos.config.ts.',
    contract:
      'Keep defineConfig and builders pure; normalize and validate only when loadConfig runs.',
    failure:
      'Return distinct not-found, import, and semantic validation errors.',
    dependencies:
      'Uses jiti only at the loading boundary; the authored model itself is data.',
    place: 'It is the first stage for every project-scoped Laymos operation.',
  }),
});
const configEntrypoint = module('src/index.ts', {
  description: 'Configuration API entrypoint',
  documentation: documentation({
    purpose: 'Exports the browser-safe configuration authoring language.',
    contract:
      'Expose pure builders and types without importing Node-only operations.',
    failure: 'The builders always return authored data and never throw.',
    dependencies: 'Re-exports the configuration model.',
    place: 'It is the laymos package root imported by laymos.config.ts files.',
  }),
});
const markdownModel = module('src/markdown', {
  description: 'Markdown value model',
  documentation: documentation({
    purpose:
      'Defines the browser-safe Markdown value shared by configuration and Story documentation.',
    contract:
      'Dedent authored template content and return serializable Markdown data without executing it.',
    failure: 'Markdown authoring is a pure operation and never fails.',
    dependencies: 'Uses no other Laymos module.',
    place:
      'It prevents configuration and Story runtime from depending on each other merely to share documentation values.',
  }),
});
const reportModel = module('src/report', {
  description: 'Serializable report model',
  documentation: documentation({
    purpose:
      'Defines the stable data exchanged between Laymos and its visual consumers.',
    contract:
      'Contain serializable values only, including architecture, Stories, Tests, coverage, and documentation.',
    failure: 'It performs no work and has no runtime failure.',
    dependencies:
      'References configuration narrative and Story artifact types as data contracts.',
    place:
      'It separates what consumers can observe from how Laymos computes it.',
  }),
});
const authoring = module('src/stories/authoring', {
  description: 'Effect Story authoring language',
  documentation: documentation({
    purpose:
      'Provides flow, step, decision, terminal, omit, and Story declaration functions.',
    contract:
      'Attach narration to Effects without changing their values, errors, or service requirements.',
    failure:
      'Narration preserves the authored Effect failure channel and introduces no expected failure of its own.',
    dependencies: 'Uses the Story runtime recorder and configuration Markdown.',
    place:
      'It is the laymos/story boundary imported by application source and Laymos itself.',
  }),
});
const runtime = module('src/stories/runtime', {
  description: 'Story tracing and scenario recording runtime',
  documentation: documentation({
    purpose:
      'Records structural traces and concrete Scenario visits from authored Story blocks.',
    contract:
      'Keep recording state scoped to the running Effect and emit serializable artifacts.',
    failure:
      'Invalid Story structure is returned to Story tooling; recorder misuse is a defect.',
    dependencies:
      'Uses Effect context, local Story declarations, and source locations.',
    place: 'It is the shared mechanism beneath Story inspection and execution.',
  }),
});
const discoverStories = module('src/stories/discover-stories', {
  description: 'Laymos surface discovery',
  documentation: documentation({
    purpose:
      'Finds the flat Laymos surface owned by each configured folder Module.',
    contract:
      'Return deterministic Laymos surfaces and keep file Modules surface-free.',
    failure:
      'File-system discovery problems are reported by the calling Story operation.',
    dependencies: 'Uses configured Module paths and the file system.',
    place:
      'It is shared by Story and Test discovery and tells static analysis which source is Laymos-only.',
  }),
});
const runStories = module('src/stories/run-stories', {
  description: 'Story discovery, tracing, and execution',
  documentation: documentation({
    purpose:
      'Builds the Story catalog, traces declarations, selects Stories, and executes their Scenarios.',
    contract:
      'Return complete Story evidence for selected Story or Module identities while preserving failed Scenario evidence as data.',
    failure:
      'Return typed discovery or runner errors for invalid source, selection, loading, tracing, or execution infrastructure.',
    dependencies:
      'Uses configuration loading, Laymos surface discovery, source inspection, runtime recording, and report contracts.',
    place:
      'It powers discoverStories, inspectStories, and runStories in the Node API.',
  }),
});
const inspectStorySource = module('src/stories/inspect-story-source', {
  description: 'Story authoring and source inspection',
  documentation: documentation({
    purpose:
      'Validates Story syntax and projects instrumented source into clean or ejected forms.',
    contract:
      'Use AST structure to classify and transform only recognized Laymos Story authoring calls.',
    failure:
      'Return typed authoring, source, or ejection errors when syntax cannot be handled safely.',
    dependencies:
      'Uses AST-grep, configuration loading, Laymos surfaces, and Effect file-system services.',
    place:
      'It protects source integrity for linting, coverage, source inspection, and ejection.',
  }),
});
const measureStoryCoverage = module('src/stories/measure-story-coverage', {
  description: 'Story narration coverage',
  documentation: documentation({
    purpose:
      'Measures narrated, omitted, and unnarrated lines within code traversed by each Story.',
    contract:
      'Return per-Story evidence and invalid Story details rather than one project-wide score.',
    failure:
      'Return a typed coverage failure when trace anchors cannot be projected safely.',
    dependencies:
      'Uses inspected Story traces, source projections, and ejection planning.',
    place:
      'It shows whether a Story completely explains the behavior it traverses.',
  }),
});
const testAuthoring = module('src/tests/authoring', {
  description: 'Test authoring language',
  documentation: documentation({
    purpose:
      'Declares named functionality Tests with primitive input-and-expectation cases.',
    contract:
      'Collect one Test declaration per file without storing presentation or comparison outcomes.',
    failure:
      'Reject invalid names and values immediately while authoring a declaration.',
    dependencies: 'Uses Effect only as an accepted execution return type.',
    place: 'It is the laymos/test boundary imported by Test files.',
  }),
});
const runTests = module('src/tests/run-tests', {
  description: 'Test discovery and execution',
  documentation: documentation({
    purpose:
      'Discovers Module-owned Tests and executes their cases sequentially.',
    contract:
      'Return a catalog before execution and presentation-neutral expected-versus-actual reports after execution.',
    failure:
      'Return typed discovery or runner errors for invalid definitions, selectors, loading, or execution infrastructure.',
    dependencies:
      'Uses configuration loading, Laymos surface discovery, Test authoring collection, and report contracts.',
    place: 'It powers discoverTests and runTests in the Node API.',
  }),
});

export default defineConfig({
  sourceRoots: ['src'],
  graphs: [
    layerGraph(
      'laymos',
      [
        edge(entrypoints, [
          architecture,
          storyTooling,
          storyRuntime,
          testTooling,
          testRuntime,
          report,
        ]),
        edge(architecture, [config, storyTooling, report]),
        edge(storyTooling, [config, storyRuntime, report]),
        edge(testTooling, [config, storyTooling, testRuntime, report]),
        edge(report, [config, storyRuntime, testRuntime]),
        edge(config, [storyRuntime, foundation]),
        edge(storyRuntime, foundation),
      ],
      { description: 'Laymos package architecture' },
    ),
  ],
  modules: [
    cliEntrypoint,
    nodeEntrypoint,
    reportEntrypoint,
    analyzeProject,
    architectureErrors,
    extractDependencies,
    resolveArchitecture,
    validateRules,
    buildReport,
    configuration,
    configEntrypoint,
    markdownModel,
    reportModel,
    authoring,
    runtime,
    discoverStories,
    runStories,
    inspectStorySource,
    measureStoryCoverage,
    testAuthoring,
    runTests,
  ],
  project,
});
