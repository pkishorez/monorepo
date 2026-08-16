import * as colors from 'yoctocolors';

import type {
  QuestionReport,
  StoryReport,
  StoryVerdict,
} from '../../story/schema/index.js';

export type VerdictTally = Readonly<Record<StoryVerdict, number>>;

export const emptyTally: VerdictTally = { passed: 0, failed: 0, errored: 0 };

export function countVerdict(
  tally: VerdictTally,
  verdict: StoryVerdict,
): VerdictTally {
  return { ...tally, [verdict]: tally[verdict] + 1 };
}

export function tallyReports(reports: readonly StoryReport[]): VerdictTally {
  return reports.reduce(
    (tally, report) => countVerdict(tally, report.verdict),
    emptyTally,
  );
}

export function renderTally(tally: VerdictTally, total: number): string {
  const done = tally.passed + tally.failed + tally.errored;
  const parts = [`${done}/${total} ${total === 1 ? 'story' : 'stories'}`];
  for (const verdict of verdicts) {
    if (tally[verdict] > 0) {
      parts.push(verdictColors[verdict](`${tally[verdict]} ${verdict}`));
    }
  }
  return parts.join(colors.dim(' · '));
}

export function renderSummary(
  reports: readonly StoryReport[],
  total: number,
): string {
  const tally = tallyReports(reports);
  const mark =
    tally.passed === total ? verdictMarks.passed : verdictMarks.failed;
  return `${mark} ${renderTally(tally, total)}`;
}

export function renderStoryReports(reports: readonly StoryReport[]): string {
  return reports.map(renderStoryReport).join('\n');
}

const verdicts = ['passed', 'failed', 'errored'] as const;

const verdictColors: Readonly<Record<StoryVerdict, (text: string) => string>> =
  {
    passed: colors.green,
    failed: colors.red,
    errored: colors.yellow,
  };

const verdictMarks: Readonly<Record<StoryVerdict, string>> = {
  passed: colors.green('✓'),
  failed: colors.red('✗'),
  errored: colors.yellow('!'),
};

function renderStoryReport(report: StoryReport): string {
  const path = report.id.split('/');
  const pad = '  '.repeat(path.length - 1);
  const title = path.at(-1) ?? report.id;
  const questions = report.questions.length;
  return [
    `${pad}${verdictMarks[report.verdict]} ${title} — ${report.verdict} (${questions} question${questions === 1 ? '' : 's'})`,
    ...report.questions.map((question) => renderQuestion(question, `${pad}  `)),
  ].join('\n');
}

function renderQuestion(question: QuestionReport, pad: string): string {
  const lines = [
    `${pad}${verdictMarks[question.verdict]} ${question.slug}`,
    ...question.assertions.map(
      (assertion) =>
        `${pad}  ${assertion.passed ? verdictMarks.passed : verdictMarks.failed} ${assertion.description}`,
    ),
  ];
  if (question.error !== undefined) {
    lines.push(indent(question.error, `${pad}  `));
  }
  return lines.join('\n');
}

function indent(text: string, pad: string): string {
  return text
    .split('\n')
    .map((line) => `${pad}${line}`)
    .join('\n');
}
