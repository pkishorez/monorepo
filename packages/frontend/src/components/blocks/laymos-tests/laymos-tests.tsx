import {
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleX,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type {
  TestCatalogCase,
  TestCatalogTest,
  TestCaseReport,
  TestExpectation,
  TestPath,
  TestValue,
} from 'laymos/report';

import { Button } from '#components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#components/ui/accordion';
import { cn } from '#lib/utils';

import type {
  LaymosTestCodeLanguage,
  LaymosTestComparisonLayout,
  LaymosTestsProps,
  LaymosTestStringView,
} from './types';
import { HighlightedCode } from './highlighted-code';

const codeLanguages: readonly {
  readonly value: LaymosTestCodeLanguage;
  readonly label: string;
}[] = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'tsx', label: 'TSX' },
  { value: 'jsx', label: 'JSX' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
  { value: 'bash', label: 'Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
];

/** Renders a Laymos Test catalog and its expected-versus-actual report. */
export function LaymosTests({
  catalog,
  report,
  selectedTestPath,
  onSelectedTestPathChange,
  onRunTest,
  onRunAll,
  runningTestPath = null,
  runningAll = false,
  className,
}: LaymosTestsProps) {
  const tests = useMemo(
    () => catalog.modules.flatMap((module) => module.tests),
    [catalog],
  );
  const [localSelection, setLocalSelection] = useState<TestPath | null>(
    selectedTestPath ?? tests[0]?.testPath ?? null,
  );
  const [stringView, setStringView] = useState<LaymosTestStringView>('auto');
  const [codeLanguage, setCodeLanguage] =
    useState<LaymosTestCodeLanguage>('typescript');
  const [layout, setLayout] =
    useState<LaymosTestComparisonLayout>('side-by-side');
  const [expandedCases, setExpandedCases] = useState<string[]>([]);
  const selection =
    selectedTestPath === undefined ? localSelection : selectedTestPath;

  useEffect(() => {
    if (
      selectedTestPath === undefined &&
      !tests.some(({ testPath }) => testPath === localSelection)
    ) {
      setLocalSelection(tests[0]?.testPath ?? null);
    }
  }, [localSelection, selectedTestPath, tests]);

  const selectedTest = tests.find(({ testPath }) => testPath === selection);
  const selectedReport =
    selection === null ? undefined : report?.tests[selection];
  const showsCode =
    selectedTest !== undefined &&
    testShowsCode(selectedTest, selectedReport, stringView);
  const hasFailedCase =
    selectedReport?.cases.some(
      ({ expected, actual }) => !expectationsMatch(expected, actual),
    ) ?? false;
  const caseValues =
    selectedTest?.cases.map((_, index) => `case-${index}`) ?? [];
  const allExpanded =
    caseValues.length > 0 && expandedCases.length === caseValues.length;

  useEffect(() => {
    setExpandedCases([]);
  }, [selection]);

  const select = (testPath: TestPath) => {
    setLocalSelection(testPath);
    onSelectedTestPathChange?.(testPath);
  };

  return (
    <section
      className={cn(
        'grid min-h-0 grid-cols-[17rem_minmax(0,1fr)] overflow-hidden rounded-xl border bg-background',
        className,
      )}
      aria-label="Laymos tests"
    >
      <nav className="min-h-0 overflow-y-auto border-r bg-muted/20 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Tests</h2>
            <p className="text-xs text-muted-foreground">
              {tests.length} {tests.length === 1 ? 'test' : 'tests'}
            </p>
          </div>
          {onRunAll && tests.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={runningAll}
              onClick={onRunAll}
            >
              <RefreshCw
                className={cn('size-3.5', runningAll && 'animate-spin')}
              />
              Run all
            </Button>
          )}
        </div>
        <div className="space-y-4">
          {catalog.modules.map((module) => (
            <div key={module.modulePath}>
              <p className="mb-1 truncate px-2 text-xs font-medium text-muted-foreground">
                {module.modulePath}
              </p>
              <div className="space-y-1">
                {module.tests.map((entry) => (
                  <TestNavigationItem
                    key={entry.testPath}
                    test={entry}
                    report={report?.tests[entry.testPath]}
                    selected={entry.testPath === selection}
                    onSelect={select}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <main className="min-h-0 overflow-y-auto">
        {selectedTest ? (
          <>
            <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-5 py-4 backdrop-blur">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{selectedTest.name}</h2>
                <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                  {selectedTest.description}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
                  {selectedTest.testPath}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Control
                  label="Strings"
                  value={stringView}
                  options={['auto', 'text', 'markdown', 'code']}
                  onChange={setStringView}
                />
                {showsCode && (
                  <LanguageControl
                    value={codeLanguage}
                    onChange={setCodeLanguage}
                  />
                )}
                {hasFailedCase && (
                  <Control
                    label="Comparison"
                    value={layout}
                    options={['side-by-side', 'stacked']}
                    onChange={setLayout}
                  />
                )}
                {onRunTest && (
                  <Button
                    size="sm"
                    disabled={
                      runningAll || runningTestPath === selectedTest.testPath
                    }
                    onClick={() => onRunTest(selectedTest.testPath)}
                  >
                    {runningTestPath === selectedTest.testPath ? (
                      <RefreshCw className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    Run test
                  </Button>
                )}
              </div>
            </header>
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {selectedTest.cases.length}{' '}
                  {selectedTest.cases.length === 1 ? 'Test Case' : 'Test Cases'}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() =>
                    setExpandedCases(allExpanded ? [] : caseValues)
                  }
                >
                  {allExpanded ? (
                    <ChevronsDownUp className="size-3.5" />
                  ) : (
                    <ChevronsUpDown className="size-3.5" />
                  )}
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </Button>
              </div>
              <Accordion
                multiple
                value={expandedCases}
                onValueChange={(nextExpandedCases) => {
                  const newlyExpandedCase = nextExpandedCases.find(
                    (value) => !expandedCases.includes(value),
                  );

                  setExpandedCases(
                    newlyExpandedCase === undefined
                      ? nextExpandedCases
                      : [newlyExpandedCase],
                  );
                }}
                className="gap-3"
              >
                {selectedTest.cases.map((testCase, index) => (
                  <TestCaseCard
                    key={`${testCase.name}:${index}`}
                    value={caseValues[index]!}
                    definition={testCase}
                    result={selectedReport?.cases[index]}
                    stringView={stringView}
                    codeLanguage={codeLanguage}
                    layout={layout}
                  />
                ))}
              </Accordion>
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center p-8 text-sm text-muted-foreground">
            No Tests found.
          </div>
        )}
      </main>
    </section>
  );
}

function TestNavigationItem({
  test,
  report,
  selected,
  onSelect,
}: {
  readonly test: TestCatalogTest;
  readonly report?: { readonly cases: readonly TestCaseReport[] };
  readonly selected: boolean;
  readonly onSelect: (testPath: TestPath) => void;
}) {
  const passed =
    report !== undefined &&
    report.cases.every(({ expected, actual }) =>
      expectationsMatch(expected, actual),
    );
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
      )}
      onClick={() => onSelect(test.testPath)}
    >
      {report === undefined ? (
        <span className="size-4 rounded-full border" />
      ) : passed ? (
        <Check className="size-4 text-emerald-600" />
      ) : (
        <CircleX className="size-4 text-destructive" />
      )}
      <span className="min-w-0 flex-1 truncate">{test.name}</span>
      <ChevronRight className="size-3.5 text-muted-foreground" />
    </button>
  );
}

function TestCaseCard({
  value,
  definition,
  result,
  stringView,
  codeLanguage,
  layout,
}: {
  readonly value: string;
  readonly definition: TestCatalogCase;
  readonly result?: TestCaseReport;
  readonly stringView: LaymosTestStringView;
  readonly codeLanguage: LaymosTestCodeLanguage;
  readonly layout: LaymosTestComparisonLayout;
}) {
  const passed =
    result !== undefined && expectationsMatch(result.expected, result.actual);
  const negative = definition.kind === 'negative';
  return (
    <AccordionItem
      value={value}
      className="overflow-hidden rounded-lg border last:border-b"
    >
      <AccordionTrigger className="items-center rounded-none bg-muted/20 px-4 py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3">
          <span className="flex min-w-0 items-start gap-3 text-left">
            <span
              className={cn(
                'mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                negative
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                  : 'border-sky-500/30 bg-sky-500/10 text-sky-600',
              )}
            >
              {negative ? 'Negative' : 'Positive'}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">
                {definition.name}
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
                {definition.description}
              </span>
            </span>
          </span>
          {result === undefined ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              Not run
            </span>
          ) : passed ? (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600">
              <Check className="size-3" />{' '}
              {negative ? 'Rejected as expected' : 'Passed'}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-destructive">
              <CircleX className="size-3" /> Failed
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 border-t p-4">
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Given
          </p>
          <div className="grid gap-2">
            {definition.inputs.map((input, index) => (
              <ValueView
                key={index}
                label={`Input ${index + 1}`}
                value={input}
                stringView={stringView}
                codeLanguage={codeLanguage}
              />
            ))}
          </div>
        </div>
        {result === undefined ? (
          <ExpectationView
            label={negative ? 'Expected rejection' : 'Expected result'}
            expectation={definition.expected}
            stringView={stringView}
            codeLanguage={codeLanguage}
          />
        ) : passed ? (
          <ExpectationView
            label={negative ? 'Rejected with' : 'Result'}
            expectation={result.actual}
            stringView={stringView}
            codeLanguage={codeLanguage}
          />
        ) : (
          <div
            className={cn(
              'grid gap-3',
              layout === 'side-by-side' && 'md:grid-cols-2',
            )}
          >
            <ExpectationView
              label={negative ? 'Expected rejection' : 'Expected'}
              expectation={definition.expected}
              stringView={stringView}
              codeLanguage={codeLanguage}
            />
            <ExpectationView
              label="Actual"
              expectation={result.actual}
              stringView={stringView}
              codeLanguage={codeLanguage}
            />
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function ExpectationView({
  label,
  expectation,
  stringView,
  codeLanguage,
}: {
  readonly label: string;
  readonly expectation: TestExpectation;
  readonly stringView: LaymosTestStringView;
  readonly codeLanguage: LaymosTestCodeLanguage;
}) {
  return expectation.kind === 'error' ? (
    <div className="rounded-md border bg-muted/10 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label} error
      </p>
      <code className="text-sm">{expectation.name}</code>
    </div>
  ) : (
    <ValueView
      label={label}
      value={expectation.value}
      stringView={stringView}
      codeLanguage={codeLanguage}
    />
  );
}

function ValueView({
  label,
  value,
  stringView,
  codeLanguage,
}: {
  readonly label: string;
  readonly value: TestValue;
  readonly stringView: LaymosTestStringView;
  readonly codeLanguage: LaymosTestCodeLanguage;
}) {
  const inferredView = inferStringView(value, stringView);
  return (
    <div className="min-w-0 rounded-md border bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className="text-[10px] uppercase text-muted-foreground">
          {typeof value === 'string'
            ? inferredView === 'code'
              ? `code · ${codeLanguage}`
              : inferredView
            : typeof value}
        </span>
      </div>
      {typeof value !== 'string' ? (
        <code className="text-sm">{String(value)}</code>
      ) : inferredView === 'markdown' ? (
        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      ) : inferredView === 'code' ? (
        <HighlightedCode code={value} language={codeLanguage} />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{value}</p>
      )}
    </div>
  );
}

function LanguageControl({
  value,
  onChange,
}: {
  readonly value: LaymosTestCodeLanguage;
  readonly onChange: (value: LaymosTestCodeLanguage) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      Language
      <select
        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
        value={value}
        onChange={(event) =>
          onChange(event.target.value as LaymosTestCodeLanguage)
        }
      >
        {codeLanguages.map((language) => (
          <option key={language.value} value={language.value}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Control<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly Value[];
  readonly onChange: (value: Value) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value as Value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll('-', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

function expectationsMatch(
  expected: TestExpectation,
  actual: TestExpectation,
): boolean {
  return (
    expected.kind === actual.kind &&
    (expected.kind === 'error'
      ? expected.name === (actual.kind === 'error' ? actual.name : undefined)
      : Object.is(
          expected.value,
          actual.kind === 'value' ? actual.value : undefined,
        ))
  );
}

function inferStringView(
  value: TestValue,
  preference: LaymosTestStringView,
): Exclude<LaymosTestStringView, 'auto'> {
  if (typeof value !== 'string' || preference !== 'auto') {
    return preference === 'auto' ? 'text' : preference;
  }
  if (
    /(^|\n)\s*(#{1,6}\s|[-*]\s|\d+\.\s|>\s)|\[[^\]]+\]\([^)]+\)/m.test(value)
  ) {
    return 'markdown';
  }
  if (
    /(^|\n)\s*(import |export |const |let |function |class |interface |type |[{[])/m.test(
      value,
    ) ||
    /[;{}]\s*$/.test(value)
  ) {
    return 'code';
  }
  return 'text';
}

function testShowsCode(
  test: TestCatalogTest,
  report: { readonly cases: readonly TestCaseReport[] } | undefined,
  stringView: LaymosTestStringView,
): boolean {
  const values = test.cases.flatMap((testCase, index) => [
    ...testCase.inputs,
    ...(testCase.expected.kind === 'value' ? [testCase.expected.value] : []),
    ...(report?.cases[index]?.actual.kind === 'value'
      ? [report.cases[index].actual.value]
      : []),
  ]);
  return values.some((value) => inferStringView(value, stringView) === 'code');
}
