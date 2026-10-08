import * as colors from 'yoctocolors';

import type {
  ProofLeaf,
  ProofReport,
  ProofVerdict,
  StoryNode,
} from '../../story/schema/index.js';

export type VerdictTally = Readonly<Record<ProofVerdict, number>>;

export const emptyTally: VerdictTally = {
  passed: 0,
  failed: 0,
  errored: 0,
  unprepared: 0,
};

export function countVerdict(
  tally: VerdictTally,
  verdict: ProofVerdict,
): VerdictTally {
  return { ...tally, [verdict]: tally[verdict] + 1 };
}

export function renderTally(tally: VerdictTally, total: number): string {
  const done = verdicts.reduce((sum, verdict) => sum + tally[verdict], 0);
  const parts = [`${done}/${total} ${total === 1 ? 'Proof' : 'Proofs'}`];
  for (const verdict of verdicts) {
    if (tally[verdict] > 0) {
      parts.push(verdictColors[verdict](`${tally[verdict]} ${verdict}`));
    }
  }
  return parts.join(colors.dim(' · '));
}

export function renderSummary(
  reports: readonly ProofReport[],
  total: number,
  issues = 0,
): string {
  const tally = reports.reduce(
    (sum, report) => countVerdict(sum, report.verdict),
    emptyTally,
  );
  const mark =
    tally.passed === total ? verdictMarks.passed : verdictMarks.failed;
  const told =
    issues === 0
      ? ''
      : `${colors.dim(' · ')}${colors.yellow(`${issues} Telling ${issues === 1 ? 'issue' : 'issues'}`)}`;
  return `${mark} ${renderTally(tally, total)}${told}`;
}

/** Critical Proofs that did not pass come first, then the Story tree by title. */
export function renderStoryRun(
  tree: StoryNode,
  reports: readonly ProofReport[],
): string {
  const byId = new Map(reports.map((report) => [report.id, report]));
  const critical = proofsBeneath(tree).filter(
    (leaf) => leaf.critical && byId.get(leaf.id)?.verdict !== 'passed',
  );
  const sections =
    critical.length === 0
      ? []
      : [
          colors.red(colors.bold('Critical Proofs that did not pass')),
          ...critical.map((leaf) => `  ${renderLeaf(leaf, byId.get(leaf.id))}`),
          '',
        ];
  return [...sections, ...renderStory(tree, byId, '')].join('\n');
}

function renderStory(
  story: StoryNode,
  byId: ReadonlyMap<string, ProofReport>,
  pad: string,
): string[] {
  const inner = `${pad}  `;
  return [
    `${pad}${colors.bold(story.title)} ${colors.dim(story.id)}`,
    ...story.issues.map(
      (issue) => `${inner}${colors.yellow('⚠')} ${issue.message}`,
    ),
    ...story.proofs.flatMap((leaf) => {
      const report = byId.get(leaf.id);
      return [
        `${inner}${renderLeaf(leaf, report)}`,
        ...(report === undefined ? [] : renderProblems(report, `${inner}    `)),
      ];
    }),
    ...story.stories.flatMap((child) => renderStory(child, byId, inner)),
  ];
}

function renderLeaf(leaf: ProofLeaf, report: ProofReport | undefined): string {
  const mark =
    report === undefined ? colors.dim('·') : verdictMarks[report.verdict];
  const critical = leaf.critical ? ` ${colors.magenta('critical')}` : '';
  const timing =
    report === undefined ? '' : colors.dim(` ${Math.round(report.duration)}ms`);
  return `${mark} ${leaf.title}${critical}${timing} ${colors.dim(leaf.id)}`;
}

function renderProblems(report: ProofReport, pad: string): string[] {
  if (report.verdict === 'passed') return [];
  const lines: string[] = [];
  for (const phase of report.phases) {
    for (const assertion of phase.assertions) {
      if (!assertion.passed) {
        lines.push(
          `${pad}${verdictMarks.failed} ${phase.phase}: ${assertion.description}`,
        );
      }
    }
    if (phase.error !== undefined && phase.error !== report.error) {
      lines.push(
        `${pad}${colors.yellow(`${phase.phase} died:`)}`,
        indent(phase.error, `${pad}  `),
      );
    }
  }
  if (report.error !== undefined) {
    lines.push(indent(colors.yellow(report.error), pad));
  }
  return lines;
}

function proofsBeneath(story: StoryNode): ProofLeaf[] {
  return [...story.proofs, ...story.stories.flatMap(proofsBeneath)];
}

function indent(text: string, pad: string): string {
  return text
    .split('\n')
    .map((line) => `${pad}${line}`)
    .join('\n');
}

const verdicts = ['passed', 'failed', 'errored', 'unprepared'] as const;

const verdictColors: Readonly<Record<ProofVerdict, (text: string) => string>> =
  {
    passed: colors.green,
    failed: colors.red,
    errored: colors.yellow,
    unprepared: colors.blue,
  };

const verdictMarks: Readonly<Record<ProofVerdict, string>> = {
  passed: colors.green('✓'),
  failed: colors.red('✗'),
  errored: colors.yellow('!'),
  unprepared: colors.blue('○'),
};
