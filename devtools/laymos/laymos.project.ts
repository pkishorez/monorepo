import { markdown, projectNarrative } from 'laymos';

export const project = projectNarrative(
  'Laymos',
  markdown`
    # How Laymos works

    The useful mental model is that Laymos has three consumers and two
    independent journeys.

    The configuration API is used while authoring \`laymos.config.ts\`. The Node
    API is used by other tools, including DevTools. The CLI is the human-facing
    adapter. The Node API and CLI do not implement their own analysis rules;
    they call the same underlying operations and consume the same report model.

    Static architecture analysis explains how source files are organized and
    whether their imports respect the declared architecture. Story tooling
    explains how selected behavior travels through that source. Static analysis
    does not execute Stories, and running Stories does not reinterpret the
    architecture.

    ## Configuration is the starting point

    A project authors Layers, Layer Graphs, Modules, optional Module rules, and
    an optional Project Narrative through the pure \`laymos\` entrypoint.
    \`defineConfig()\` and the other builders only create typed data. They do not
    read the file system and do not throw.

    Every project-scoped operation starts by loading \`laymos.config.ts\`.
    \`loadConfig()\` uses jiti so the TypeScript file can be imported directly
    without a separate build. It disables the module cache because DevTools
    must observe the latest saved configuration.

    Validation happens after import. Paths are normalized and the complete
    configuration is checked together: source roots, Layer identity, graph
    cycles, Module boundaries, rule references, descriptions, documentation,
    and Project Narrative content. A missing file, an import failure, and an
    invalid configuration are different typed errors.

    A configured source path that does not yet exist is not a configuration
    error. It becomes a warning in the architecture report. This allows a team
    to declare the intended structure before every folder has been created.

    ## The static analysis journey

    \`analyzeProject({ projectDir })\` is the public operation. Its Story is the
    shortest accurate account of the stages below.

    ### Load and validate configuration

    Analysis first obtains normalized architectural intent. Nothing scans the
    codebase until the configuration is known to be valid.

    ### Discover Laymos surfaces

    Each configured folder Module may own one flat \`laymos/\` directory.
    Laymos finds these directories before dependency extraction. Story and Test
    source may import production code, so it must not be counted as production
    architecture. The extractor still retains a production-to-Laymos import as
    violation evidence because that dependency points in the forbidden
    direction.

    ### Extract project dependencies

    Laymos walks every configured source root to build a deterministic inventory
    of JavaScript and TypeScript files. Declaration files, minified files,
    ignored paths, Laymos surfaces, platform built-ins, and third-party packages
    are outside the architecture graph.

    It then asks skott for the imports between project files. skott understands
    TypeScript resolution, path aliases, CommonJS, and type-only imports. Laymos
    uses skott only for dependency facts; skott has no knowledge of Layers,
    Modules, or permission rules.

    Type-only imports remain architectural dependencies. Files that are not
    reached from another entry are analyzed separately so isolated source files
    do not disappear from coverage.

    ### Resolve declared architecture

    The extracted graph says what exists. Resolution joins those facts with the
    configuration.

    Each file becomes covered by a Layer, uncovered, or ignored. The longest
    matching Layer path owns a file when Layer paths are nested. A covered file
    may also belong to one configured Module. Module paths are validated before
    this point, so ownership is unambiguous.

    Laymos combines the configured Layer Graphs and computes reachability across
    their union. Imports involving ignored files are removed. Ignore means
    invisible; it is not a permission.

    ### Validate architecture rules

    Rule validation checks every remaining import. A cross-Layer import is
    allowed only when the destination Layer is reachable from the source Layer.
    Layers are default-deny.

    Module rules are optional and only tighten the Layer result.
    \`canImport\` restricts a consuming Module and \`canImportedBy\` restricts a
    providing Module. When both exist, both must agree. A Module rule can never
    permit an import rejected by the Layer Graph.

    Violations are successful result data, not Effect failures. Layer and Module
    coverage are also result data. They help a project see missing declarations
    without making gradual adoption impossible.

    ### Build the report

    The final stage creates one serializable report containing the declared
    architecture, Module documentation, resolved files, imports, violations,
    coverage, and warnings. The CLI and DevTools use this same artifact, so
    enforcement and inspection cannot develop different meanings.

    ## The Story journeys

    Story operations begin from configured Modules. There is no separate list of
    Story roots.

    ### Discover Stories

    \`discoverStories({ projectDir })\` finds each Module-owned Laymos surface,
    validates direct files, loads each \`<story-name>.story.ts\` declaration,
    and builds a catalog with explicit Module ownership. It does not trace or
    execute behavior.

    A Laymos surface is flat. One Story file declares exactly one Story. Other
    direct files may provide shared support. File Modules cannot own a Laymos
    surface.

    ### Inspect Stories

    \`inspectStories({ projectDir })\` starts with discovery and loads each Story
    in trace mode. Trace mode follows every declared Decision Arm without
    performing the real operation inside a Step or Terminal. The result is the
    complete intended narration, including branches that no single Scenario
    visits.

    A Story belongs to the Module that owns its Story file, but its Blocks may
    live in several Modules. This is how one behavioral journey remains
    connected to the static code structure.

    ### Run Stories

    \`runStories({ projectDir, selectors, timeout })\` accepts typed Story and
    Module selectors. An empty selection means every Story. Selection is
    validated against the discovered catalog before execution.

    Laymos creates a fresh structural trace, then runs Scenarios sequentially.
    Each Scenario prepares controlled input, executes the same Story, verifies a
    success value or typed error, and may clean up. Failed expectations,
    interruption, timings, visited Blocks, and selected Decision Arms remain in
    the returned evidence. A failed Scenario is result data; an invalid
    selection or runner failure is a typed Effect error.

    Scenario coverage asks whether the authored Scenarios visit every narrated
    Block. Good coverage includes every controllable Decision Arm, meaningful
    success shape, and public typed error. A branch that depends on an
    uncontrollable external condition may be left out deliberately.

    ### Measure narration coverage

    \`measureStoryCoverage({ projectDir })\` combines structural traces with a
    safe source projection. It reports narrated, explicitly omitted, and
    unnarrated lines only inside functions traversed by each Story. Coverage is
    per Story; Laymos does not invent one project-wide percentage.

    ### Inspect and eject Story source

    \`inspectStorySource()\` uses AST-grep to validate recognized Story calls and
    produce clean and fully ejected views of one source file. Source editing is
    structural, not a text replacement.

    \`ejectStories({ projectDir })\` plans every production rewrite before
    writing. It applies the project-wide plan atomically and rolls back if a
    write fails. A dry run returns the same plan without changing files. Laymos
    surfaces remain untouched.

    ## The Test journey

    \`discoverTests({ projectDir })\` finds each Module-owned
    \`laymos/*.test.ts\` file and builds a catalog without executing cases.
    \`runTests({ projectDir, selectors, timeout })\` executes selected Tests
    sequentially and reports each case's name, primitive inputs, expectation,
    and actual result alongside the Test's name and description. Pass or
    failure, diffs, and string presentation are derived by consumers rather
    than stored in the report.

    Laymos normally recognizes authoring imported from \`laymos/story\`. While
    Laymos narrates itself, it also recognizes the exact local
    \`src/stories/authoring\` entrypoint. This narrow escape hatch prevents the
    self-hosted Stories from loading stale build output without permitting
    arbitrary aliases.

    ## Package and folder boundaries

    - \`laymos\` exposes pure configuration authoring.
    - \`laymos/node\` exposes project-scoped Effect operations. Live Node
      services are supplied internally, so consumers receive Effects with no
      remaining service requirements.
    - \`laymos/story\` exposes the Effect Story authoring language.
    - \`laymos/test\` exposes the Test authoring language.
    - \`laymos/report\` exposes serializable consumer contracts.

    Internally, \`src/entrypoints\` adapts those public consumers.
    \`src/architecture\` owns the static stages. \`src/stories/authoring\` and
    \`src/stories/runtime\` own narration and recording.
    \`src/stories/discover-stories\`, \`run-stories\`,
    \`inspect-story-source\`, and \`measure-story-coverage\` own Story tooling.
    \`src/tests/authoring\` and \`src/tests/run-tests\` own Test declarations,
    discovery, and execution.
    \`src/config\` owns authored intent, validation, and loading.
    \`src/report\` owns data exchanged with consumers.

    Every configured Module includes a short technical document describing its
    purpose, contract, failure behavior, dependencies, and place in Laymos.
    Those Module notes are the next level of detail after this project journey.
    Executable Stories then show the important public behavior as narrated
    Blocks and controlled Scenarios.

    ## Technology glossary

    ### Effect

    Effect represents operations that may fail, perform I/O, need services, or
    require scoped cleanup. Expected failures stay typed. A calculation that
    always succeeds remains a normal function.

    ### jiti

    jiti imports a project's TypeScript configuration and Story modules without
    asking the project to compile them first. Laymos disables its module cache
    so repeated DevTools reads are fresh.

    ### skott

    skott extracts TypeScript-aware file dependency facts. Laymos owns file
    inventory, architectural meaning, rule validation, and reporting around
    those facts.

    ### AST-grep

    AST-grep parses Story authoring syntax for validation, source projection,
    narration coverage, and ejection. Structural edits let Laymos reject
    ambiguous syntax instead of guessing.

    ### TypeScript

    TypeScript keeps configuration references, public requests, report
    contracts, Story inputs, and error channels connected during refactoring.

    ## Important boundaries

    Laymos governs source-file imports. It cannot infer runtime coupling through
    queues, events, dependency injection, databases, or network calls. Layers
    have no implicit permission. Module rules cannot loosen a Layer rule.
    Ignored files are invisible. Laymos surfaces cannot be nested. Story and
    Test execution are sequential. Story ejection is project-wide and leaves
    Laymos surfaces intact.
  `,
);
