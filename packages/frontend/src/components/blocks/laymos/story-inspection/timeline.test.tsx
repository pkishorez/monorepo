import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuestionProof, type QuestionReport } from './timeline';

describe('QuestionProof', () => {
  it('collapses the result by default', () => {
    const report: QuestionReport = {
      slug: 'returns-a-result',
      verdict: 'passed',
      result: { answer: 42 },
      assertions: [],
      sections: [],
    };

    const markup = renderToStaticMarkup(<QuestionProof report={report} />);

    expect(markup).toContain('result');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('&quot;answer&quot;');
  });
});
