import { describe } from 'vitest';

import { mapError } from '../src/tests/run-tests/run-tests.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

describe('Laymos', () => {
  laymosDescribe(
    'Report Test Errors',
    {
      description:
        'Converts runner failures into the serializable error contract used by Test Reports.',
      documentation: `
# Test failure evidence

Vitest owns execution and matcher behavior. Laymos preserves the completed
failure as data so terminal and DevTools consumers can show the same evidence.
Matcher comparisons retain expected, actual, and diff fields when Vitest
provides them. Unknown thrown values still become a safe public error.
`,
    },
    () => {
      laymosTest(
        'Preserves matcher comparison details.',
        {
          description:
            'Assertion failures retain the values and diff needed to explain the mismatch.',
        },
        ({ expect }) => {
          const actual = mapError({
            name: 'AssertionError',
            message: 'expected 5 to be 4',
            stack: 'AssertionError: expected 5 to be 4',
            expected: '4',
            actual: '5',
            diff: '- Expected\\n+ Received\\n- 4\\n+ 5',
          });

          expect(
            actual,
            'The Test Report retains every supplied matcher comparison field.',
          ).toEqual({
            name: 'AssertionError',
            message: 'expected 5 to be 4',
            stack: 'AssertionError: expected 5 to be 4',
            expected: '4',
            actual: '5',
            diff: '- Expected\\n+ Received\\n- 4\\n+ 5',
          });
        },
      );

      laymosTest(
        'Defaults the name of a structured error.',
        {
          description:
            'A runner error with a message but no name remains useful to readers.',
        },
        ({ expect }) => {
          const actual = mapError({ message: 'Worker stopped' });

          expect(
            actual,
            'The Test Report supplies the standard Error name without inventing other fields.',
          ).toEqual({ name: 'Error', message: 'Worker stopped' });
        },
      );

      laymosTest(
        'Serializes an unknown thrown value.',
        {
          description:
            'Non-error throws cannot escape the report mapping boundary.',
        },
        ({ expect }) => {
          const actual = mapError('worker stopped');

          expect(
            actual,
            'The unknown thrown value becomes a safe generic Test Report error.',
          ).toEqual({ name: 'Error', message: 'worker stopped' });
        },
      );
    },
  );
});
