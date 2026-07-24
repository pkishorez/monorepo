import { describe, expect, it } from 'vitest';

import { mapError } from '../src/tests/run-tests/run-tests.js';

describe('Vitest error reporting', () => {
  it('preserves matcher comparison details', () => {
    expect(
      mapError({
        name: 'AssertionError',
        message: 'expected 5 to be 4',
        stack: 'AssertionError: expected 5 to be 4',
        expected: '4',
        actual: '5',
        diff: '- Expected\\n+ Received\\n- 4\\n+ 5',
      }),
    ).toEqual({
      name: 'AssertionError',
      message: 'expected 5 to be 4',
      stack: 'AssertionError: expected 5 to be 4',
      expected: '4',
      actual: '5',
      diff: '- Expected\\n+ Received\\n- 4\\n+ 5',
    });
  });
});
