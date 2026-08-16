import { describe, expect, test } from 'vitest';

import type { StoryReport } from '../../../story/schema/index.js';
import { renderStoryReports, renderSummary, tallyReports } from '../report.js';

const ansiEscapeCodes = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

function plain(rendered: string): string {
  return rendered.replace(ansiEscapeCodes, '');
}

const passing: StoryReport = {
  id: 'basic/verdicts/passing story',
  verdict: 'passed',
  questions: [
    {
      slug: 'what-is-the-answer',
      verdict: 'passed',
      assertions: [{ description: 'the answer is 42', passed: true }],
      sections: [],
    },
  ],
};

const failing: StoryReport = {
  id: 'basic/verdicts/failing story',
  verdict: 'failed',
  questions: [
    {
      slug: 'what-happens-when-it-does-not-hold',
      verdict: 'failed',
      assertions: [
        { description: 'holds', passed: true },
        { description: 'does not hold', passed: false },
      ],
      sections: [],
    },
  ],
};

const erroring: StoryReport = {
  id: 'basic/erroring story',
  verdict: 'errored',
  questions: [
    {
      slug: 'what-happens-when-the-proof-dies',
      verdict: 'errored',
      error: 'Error: boom\n  at proof',
      assertions: [],
      sections: [],
    },
  ],
};

describe('renderStoryReports', () => {
  test('indents each Story by its place in the Story tree', () => {
    expect(plain(renderStoryReports([passing, erroring]))).toBe(
      [
        '    ✓ passing story — passed (1 question)',
        '      ✓ what-is-the-answer',
        '        ✓ the answer is 42',
        '  ! erroring story — errored (1 question)',
        '    ! what-happens-when-the-proof-dies',
        '      Error: boom',
        '        at proof',
      ].join('\n'),
    );
  });

  test('marks the assertion that did not hold', () => {
    expect(plain(renderStoryReports([failing]))).toContain(
      '        ✗ does not hold',
    );
  });

  test('indents the error under its Question', () => {
    expect(plain(renderStoryReports([erroring]))).toContain(
      '      Error: boom\n        at proof',
    );
  });
});

describe('renderSummary', () => {
  test('counts every verdict against the planned total', () => {
    expect(plain(renderSummary([passing, failing, erroring], 4))).toBe(
      '✗ 3/4 stories · 1 passed · 1 failed · 1 errored',
    );
  });

  test('reports a clean run once every Story passed', () => {
    expect(plain(renderSummary([passing], 1))).toBe('✓ 1/1 story · 1 passed');
  });
});

describe('tallyReports', () => {
  test('counts one Story per verdict', () => {
    expect(tallyReports([passing, failing, erroring, failing])).toEqual({
      passed: 1,
      failed: 2,
      errored: 1,
    });
  });
});
