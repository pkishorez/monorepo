import { describe, expect, it } from 'vitest';

import {
  COLLAPSED_STATE_HEIGHT,
  DESCRIPTION_BLOCK_PADDING,
  DESCRIPTION_LINE_HEIGHT,
  MAX_DESCRIPTION_LINES,
  getDescriptionLineCount,
  getStateNodeHeight,
} from './metrics';

describe('state node sizing', () => {
  it('collapses nodes without a description', () => {
    expect(getStateNodeHeight()).toBe(COLLAPSED_STATE_HEIGHT);
  });

  it('grows the node as the description wraps onto more lines', () => {
    const short = getStateNodeHeight('Traffic is stopped.');
    const long = getStateNodeHeight(
      'A pure routing decision that picks a checkout lane from the customer tier and basket size, without waiting for an event.',
    );

    expect(getDescriptionLineCount('Traffic is stopped.')).toBe(1);
    expect(long).toBeGreaterThan(short);
  });

  it('caps the reserved space so one node cannot dominate the diagram', () => {
    const line = getStateNodeHeight('x');
    const overflowing = getStateNodeHeight('x'.repeat(5000));

    expect(getDescriptionLineCount('x'.repeat(5000))).toBe(
      MAX_DESCRIPTION_LINES,
    );
    expect(overflowing).toBeLessThanOrEqual(line + MAX_DESCRIPTION_LINES * 16);
  });

  it('reserves the border, padding and every wrapped line', () => {
    const description = 'Payment could not be completed.';

    expect(getStateNodeHeight(description)).toBe(
      COLLAPSED_STATE_HEIGHT +
        DESCRIPTION_BLOCK_PADDING +
        getDescriptionLineCount(description) * DESCRIPTION_LINE_HEIGHT,
    );
  });

  it('wraps on word boundaries rather than raw character counts', () => {
    expect(getDescriptionLineCount('The regular queue.')).toBe(1);
    expect(
      getDescriptionLineCount('The payment provider did not answer.'),
    ).toBe(2);
  });

  it('counts explicit line breaks as separate lines', () => {
    expect(getDescriptionLineCount('one\ntwo\nthree')).toBe(3);
  });
});
