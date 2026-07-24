import { markdown, projectNarrative } from 'laymos';

export const project = projectNarrative(
  'Laymos',
  markdown`
    # How Laymos works

    Laymos has two independent jobs: static architecture analysis and completed
    test reporting.

    ## Architecture analysis

    A project declares Layers, Layer Graphs, Modules, optional Module rules, and
    optional documentation in \`laymos.config.ts\`. The Node API loads and
    validates that configuration, extracts project imports with skott, resolves
    file ownership, checks the declared rules, and returns one serializable
    report.

    Architecture violations and coverage gaps are report data. Configuration
    and extraction failures use typed Effect error channels.

    Test and spec files are excluded from the production architecture graph.

    ## Test reporting

    Vitest is the only test runner. It owns discovery, configuration, fixtures,
    hooks, retries, timeouts, worker isolation, and pass or failure status.

    \`runTests({ projectDir, files?, testNamePattern? })\` resolves the selected
    project’s installed Vitest, runs it through the programmatic API, and maps
    the completed project, module, suite, and case hierarchy into the Laymos
    report model.

    Ordinary Vitest tests are always included. Tests authored with
    \`laymos/test\` record additional structured artifacts while remaining
    ordinary independently runnable Vitest tasks.

    Test assertion failures remain successful API response data. Missing or
    incompatible Vitest installations and failures to start the runner reject
    the operation. Only one run may be active for a project.

    ## Public boundaries

    - \`laymos\` exposes pure architecture configuration builders.
    - \`laymos/node\` exposes architecture analysis and test execution.
    - \`laymos/report\` exposes serializable reports and Effect Schemas.
    - \`laymos/test\` exposes metadata-enriched Vitest helpers.

    The DevTools server uses the same report model as the frontend. It waits for
    the completed Vitest run and returns one response; there is no separate
    runner or live-status protocol.
  `,
);
