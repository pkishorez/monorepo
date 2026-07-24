import type {
  TestAssertionEvidence,
  TestCaseReport,
  TestErrorReport,
  TestStatus,
  TestSuiteReport,
  TestTraceLog,
  TestTraceSpan,
  TestValue,
  TestsReport,
} from '../../report/tests.js';

export interface TestOutputOptions {
  readonly color: boolean;
  readonly detailed: boolean;
  readonly nameQuery?: string;
  readonly verbose: boolean;
}

interface Palette {
  readonly dim: (text: string) => string;
  readonly green: (text: string) => string;
  readonly red: (text: string) => string;
  readonly yellow: (text: string) => string;
}

interface SelectedCase {
  readonly caseReport: TestCaseReport;
  readonly modulePath: string;
}

/** Returns the cases visible for an optional literal full-name query. */
export function selectedTestCases(
  report: TestsReport,
  nameQuery?: string,
): readonly SelectedCase[] {
  const normalizedQuery = nameQuery?.toLocaleLowerCase();
  return report.modules.flatMap((module) =>
    [...module.cases, ...module.suites.flatMap(collectSuiteCases)]
      .filter(
        (caseReport) =>
          normalizedQuery === undefined ||
          caseReport.fullName.toLocaleLowerCase().includes(normalizedQuery),
      )
      .map((caseReport) => ({
        caseReport,
        modulePath: module.path,
      }))
      .sort(
        (left, right) =>
          (left.caseReport.location?.line ?? Number.MAX_SAFE_INTEGER) -
            (right.caseReport.location?.line ?? Number.MAX_SAFE_INTEGER) ||
          (left.caseReport.location?.column ?? Number.MAX_SAFE_INTEGER) -
            (right.caseReport.location?.column ?? Number.MAX_SAFE_INTEGER),
      ),
  );
}

/** Renders a completed Test Report for terminal presentation. */
export function renderTestsReport(
  report: TestsReport,
  options: TestOutputOptions,
): string {
  const palette = makePalette(options.color);
  const selected = selectedTestCases(report, options.nameQuery);
  const byModule = Map.groupBy(selected, ({ modulePath }) => modulePath);
  const lines: string[] = [];

  for (const [modulePath, cases] of byModule) {
    const status = aggregateStatus(
      cases.map(({ caseReport }) => caseReport.status),
    );
    lines.push(
      `${statusLabel(status, palette)}  ${modulePath}`,
      ...cases.flatMap(({ caseReport }) =>
        options.detailed || caseReport.status === 'failed'
          ? renderDetailedCase(caseReport, modulePath, options, palette)
          : renderCompactCase(caseReport, palette),
      ),
      '',
    );
  }

  const hierarchyErrors = report.modules.flatMap((module) => [
    ...module.errors,
    ...module.suites.flatMap(collectSuiteErrors),
  ]);
  if (hierarchyErrors.length > 0) {
    lines.push(
      palette.red('Test collection errors'),
      ...hierarchyErrors.flatMap((error) =>
        renderError(error, options.verbose, palette, '  '),
      ),
      '',
    );
  }

  if (report.unhandledErrors.length > 0) {
    lines.push(
      palette.red('Unhandled errors'),
      ...report.unhandledErrors.flatMap((error) =>
        renderError(error, options.verbose, palette, '  '),
      ),
      '',
    );
  }

  lines.push(renderSummary(report, selected, palette));
  return `${lines.join('\n')}\n`;
}

function collectSuiteCases(suite: TestSuiteReport): readonly TestCaseReport[] {
  return [...suite.cases, ...suite.suites.flatMap(collectSuiteCases)];
}

function collectSuiteErrors(
  suite: TestSuiteReport,
): readonly TestErrorReport[] {
  return [...suite.errors, ...suite.suites.flatMap(collectSuiteErrors)];
}

function aggregateStatus(statuses: readonly TestStatus[]): TestStatus {
  if (statuses.some((status) => status === 'failed')) return 'failed';
  if (statuses.some((status) => status === 'passed')) return 'passed';
  if (statuses.some((status) => status === 'pending')) return 'pending';
  return 'skipped';
}

function renderCompactCase(
  report: TestCaseReport,
  palette: Palette,
): readonly string[] {
  const evidence = report.evidence;
  const details = [
    evidence === undefined
      ? undefined
      : `${evidence.assertions.length} ${plural(evidence.assertions.length, 'assertion')}`,
    evidence?.trace === undefined
      ? undefined
      : `${evidence.trace.spans.length} ${plural(evidence.trace.spans.length, 'span')}`,
  ].filter((detail): detail is string => detail !== undefined);
  const suffix = details.length === 0 ? '' : ` · ${details.join(' · ')}`;
  return [
    `  ${statusSymbol(report.status, palette)} ${report.fullName}  ${palette.dim(formatDuration(report.duration))}${suffix}`,
  ];
}

function renderDetailedCase(
  report: TestCaseReport,
  modulePath: string,
  options: TestOutputOptions,
  palette: Palette,
): readonly string[] {
  const location =
    report.location === undefined
      ? modulePath
      : `${modulePath}:${report.location.line}:${report.location.column}`;
  const lines = [
    '',
    `  ${statusSymbol(report.status, palette)} ${report.fullName}`,
    palette.dim(`    ${location} · ${formatDuration(report.duration)}`),
  ];

  if (report.evidence?.description !== undefined) {
    lines.push('', `    ${report.evidence.description}`);
  }
  if (report.evidence !== undefined) {
    lines.push(
      '',
      palette.dim('    Assertions'),
      ...report.evidence.assertions.flatMap((assertion) =>
        renderAssertion(assertion, options.verbose, palette),
      ),
    );
    if (report.evidence.trace !== undefined) {
      lines.push(
        '',
        palette.dim('    Trace'),
        ...renderTrace(
          report.evidence.trace.spans,
          report.evidence.trace.logs,
          options.verbose,
          palette,
        ),
      );
    }
  }

  if (report.errors.length > 0) {
    lines.push(
      '',
      palette.red('    Errors'),
      ...report.errors.flatMap((error) =>
        renderError(error, options.verbose, palette, '      '),
      ),
    );
  }
  return lines;
}

function renderAssertion(
  assertion: TestAssertionEvidence,
  verbose: boolean,
  palette: Palette,
): readonly string[] {
  const lines = [
    `      ${assertion.status === 'passed' ? palette.green('✓') : palette.red('✗')} ${assertion.name}`,
  ];
  if (assertion.expected !== undefined) {
    lines.push(`        expected: ${formatValue(assertion.expected)}`);
  }
  if (assertion.actual !== undefined) {
    lines.push(`        actual:   ${formatValue(assertion.actual)}`);
  }
  if (verbose)
    lines.push(palette.dim(`        matcher:  ${assertion.matcher}`));
  if (assertion.error?.diff !== undefined) {
    lines.push(
      '',
      ...assertion.error.diff.split('\n').map((line) => `        ${line}`),
    );
  } else if (
    assertion.status === 'failed' &&
    assertion.error?.message !== undefined
  ) {
    lines.push(palette.red(`        ${assertion.error.message}`));
  }
  if (verbose && assertion.error?.stack !== undefined) {
    lines.push(
      ...assertion.error.stack
        .split('\n')
        .map((line) => palette.dim(`        ${line}`)),
    );
  }
  return lines;
}

function renderTrace(
  spans: readonly TestTraceSpan[],
  logs: readonly TestTraceLog[],
  verbose: boolean,
  palette: Palette,
): readonly string[] {
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const children = Map.groupBy(spans, (span) =>
    span.parentSpanId !== null && byId.has(span.parentSpanId)
      ? span.parentSpanId
      : null,
  );
  const logsBySpan = Map.groupBy(logs, ({ spanId }) => spanId);
  const lines = (children.get(null) ?? []).flatMap((span, index, roots) =>
    renderSpan(
      span,
      children,
      logsBySpan,
      '',
      index === roots.length - 1,
      verbose,
      palette,
    ),
  );
  const unscoped = logsBySpan.get(null) ?? [];
  if (verbose && unscoped.length > 0) {
    lines.push(
      '      Unscoped logs',
      ...unscoped.map((log) => renderLog(log, '        ', palette)),
    );
  }
  return lines;
}

function renderSpan(
  span: TestTraceSpan,
  children: ReadonlyMap<string | null, readonly TestTraceSpan[]>,
  logs: ReadonlyMap<string | null, readonly TestTraceLog[]>,
  prefix: string,
  last: boolean,
  verbose: boolean,
  palette: Palette,
): readonly string[] {
  const branch = last ? '└─' : '├─';
  const duration = formatDuration(span.endTime - span.startTime);
  const status = span.status === 'error' ? ` ${palette.red('[error]')}` : '';
  const lines = [
    `      ${prefix}${branch} ${span.name}  ${palette.dim(duration)}${status}`,
  ];
  const detailPrefix = `      ${prefix}${last ? '   ' : '│  '}`;

  if (verbose) {
    const attributes = Object.entries(span.attributes);
    if (attributes.length > 0) {
      lines.push(
        `${detailPrefix}attributes:`,
        ...attributes.map(
          ([key, value]) => `${detailPrefix}  ${key}: ${formatValue(value)}`,
        ),
      );
    }
    const spanLogs = logs.get(span.spanId) ?? [];
    if (spanLogs.length > 0) {
      lines.push(
        `${detailPrefix}logs:`,
        ...spanLogs.map((log) => renderLog(log, `${detailPrefix}  `, palette)),
      );
    }
    if (span.events.length > 0) {
      lines.push(
        `${detailPrefix}events:`,
        ...span.events.flatMap((event) => [
          `${detailPrefix}  ${event.name}  ${palette.dim(formatTimestampOffset(event.timestamp, span.startTime))}`,
          ...Object.entries(event.attributes).map(
            ([key, value]) =>
              `${detailPrefix}    ${key}: ${formatValue(value)}`,
          ),
        ]),
      );
    }
  }

  const childSpans = children.get(span.spanId) ?? [];
  for (const [index, child] of childSpans.entries()) {
    lines.push(
      ...renderSpan(
        child,
        children,
        logs,
        `${prefix}${last ? '   ' : '│  '}`,
        index === childSpans.length - 1,
        verbose,
        palette,
      ),
    );
  }
  return lines;
}

function renderLog(
  log: TestTraceLog,
  prefix: string,
  palette: Palette,
): string {
  const level =
    log.level === 'Error' || log.level === 'Fatal'
      ? palette.red(log.level.toUpperCase())
      : log.level === 'Warn'
        ? palette.yellow('WARN')
        : palette.dim(log.level.toUpperCase());
  const annotations = Object.entries(log.annotations)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(' ');
  return `${prefix}${level} ${formatValue(log.message)}${annotations === '' ? '' : ` ${palette.dim(annotations)}`}`;
}

function renderError(
  error: TestErrorReport,
  verbose: boolean,
  palette: Palette,
  prefix: string,
): readonly string[] {
  const lines = [palette.red(`${prefix}${error.name}: ${error.message}`)];
  if (error.diff !== undefined) {
    lines.push(...error.diff.split('\n').map((line) => `${prefix}${line}`));
  }
  if (verbose && error.stack !== undefined) {
    lines.push(
      ...error.stack.split('\n').map((line) => palette.dim(`${prefix}${line}`)),
    );
  }
  return lines;
}

function renderSummary(
  report: TestsReport,
  selected: readonly SelectedCase[],
  palette: Palette,
): string {
  const cases = selected.map(({ caseReport }) => caseReport);
  const passed = cases.filter(({ status }) => status === 'passed').length;
  const failed = cases.filter(({ status }) => status === 'failed').length;
  const skipped = cases.filter(
    ({ status }) => status === 'skipped' || status === 'pending',
  ).length;
  const assertions = cases.reduce(
    (total, caseReport) =>
      total + (caseReport.evidence?.assertions.length ?? 0),
    0,
  );
  const spans = cases.reduce(
    (total, caseReport) =>
      total + (caseReport.evidence?.trace?.spans.length ?? 0),
    0,
  );
  return [
    passed === 0 ? undefined : palette.green(`${passed} passed`),
    failed === 0 ? undefined : palette.red(`${failed} failed`),
    skipped === 0 ? undefined : palette.yellow(`${skipped} skipped`),
    `${assertions} ${plural(assertions, 'assertion')}`,
    `${spans} ${plural(spans, 'span')}`,
    formatDuration(report.duration),
  ]
    .filter((part): part is string => part !== undefined)
    .join(' · ');
}

function statusLabel(status: TestStatus, palette: Palette): string {
  if (status === 'passed') return palette.green('PASS');
  if (status === 'failed') return palette.red('FAIL');
  if (status === 'pending') return palette.yellow('PENDING');
  return palette.yellow('SKIP');
}

function statusSymbol(status: TestStatus, palette: Palette): string {
  if (status === 'passed') return palette.green('✓');
  if (status === 'failed') return palette.red('✗');
  return palette.yellow('○');
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1) return `${Math.round(milliseconds * 1_000)} µs`;
  if (milliseconds < 1_000) return `${milliseconds.toFixed(1)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
}

function formatTimestampOffset(timestamp: number, startTime: number): string {
  return `+${formatDuration(Math.max(0, timestamp - startTime))}`;
}

function formatValue(value: TestValue): string {
  return JSON.stringify(value);
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function makePalette(color: boolean): Palette {
  const paint =
    (code: string) =>
    (text: string): string =>
      color ? `\x1b[${code}m${text}\x1b[0m` : text;
  return {
    dim: paint('2'),
    green: paint('32'),
    red: paint('31'),
    yellow: paint('33'),
  };
}
