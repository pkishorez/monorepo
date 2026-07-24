import { describe } from 'vitest';

import type { TestsReport } from '../src/report/tests.js';
import {
  renderTestsReport,
  selectedTestCases,
} from '../src/entrypoints/cli/test-output.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

const report: TestsReport = {
  status: 'passed',
  duration: 42.7,
  modules: [
    {
      id: 'checkout',
      name: 'checkout.test.ts',
      path: 'src/checkout/checkout.test.ts',
      projectName: 'test',
      status: 'passed',
      duration: 42.7,
      suites: [],
      cases: [
        {
          id: 'approved',
          name: 'Checkout completes an approved order',
          fullName: 'Checkout completes an approved order',
          status: 'passed',
          duration: 42.7,
          errors: [],
          location: { line: 18, column: 1 },
          authoredBy: 'laymos',
          evidence: {
            description:
              'Shows the work performed while an approved order is checked out.',
            documentation: 'This must never appear in CLI output.',
            assertions: [
              {
                name: 'charges the order',
                matcher: 'toBe',
                status: 'passed',
                expected: 'charged',
                actual: 'charged',
              },
            ],
            trace: {
              spans: [
                {
                  traceId: 'trace',
                  spanId: 'checkout',
                  parentSpanId: null,
                  name: 'checkout',
                  startTime: 100,
                  endTime: 138.4,
                  status: 'success',
                  attributes: { orderId: 'order-1' },
                  events: [
                    {
                      name: 'authorized',
                      timestamp: 112,
                      attributes: { amount: 4999 },
                    },
                  ],
                },
              ],
              logs: [
                {
                  spanId: 'checkout',
                  timestamp: 110,
                  level: 'Info',
                  message: 'Charging order',
                  annotations: { orderId: 'order-1' },
                },
                {
                  spanId: null,
                  timestamp: 99,
                  level: 'Debug',
                  message: 'Starting checkout',
                  annotations: {},
                },
              ],
            },
          },
        },
      ],
      errors: [],
    },
  ],
  unhandledErrors: [],
};

describe('Laymos', () => {
  laymosDescribe(
    'Render Test Output',
    {
      description:
        'Selects completed Test Cases and renders their evidence for terminal readers.',
      documentation: `
# Presenting completed tests

Laymos Test Reports are presentation-neutral. The terminal renderer selects
cases by a case-insensitive literal substring and then chooses compact,
detailed, or verbose evidence.

Normal detailed output explains descriptions, named assertions, expected and
actual values, and the span tree. Verbose output additionally reveals stable
trace attributes, events, and logs. Authored documentation stays in report data
for richer consumers and is never printed in the terminal.
`,
    },
    () => {
      laymosTest(
        'Matches Test Case names by a case-insensitive literal substring.',
        {
          description:
            'Name targeting is predictable and never interprets input as a regular expression.',
        },
        ({ expect }) => {
          expect(
            selectedTestCases(report, 'APPROVED ORDER'),
            'The differently cased literal query selects the approved-order case.',
          ).toHaveLength(1);
          expect(
            selectedTestCases(report, 'approved.*order'),
            'Regular-expression syntax has no special meaning in a literal query.',
          ).toHaveLength(0);
        },
      );

      laymosTest(
        'Returns every Test Case when no name query is provided.',
        {
          description:
            'An untargeted report includes the complete executed case set.',
        },
        ({ expect }) => {
          const actual = selectedTestCases(report);

          expect(
            actual.map(({ caseReport }) => caseReport.fullName),
            'The untargeted selection contains every completed Test Case.',
          ).toEqual(['Checkout completes an approved order']);
        },
      );

      laymosTest(
        'Shows readable evidence while hiding verbose trace metadata.',
        {
          description:
            'Detailed output teaches the outcome without overwhelming the normal terminal view.',
        },
        ({ expect }) => {
          const output = renderTestsReport(report, {
            color: false,
            detailed: true,
            verbose: false,
          });

          expect(
            output,
            'Detailed output names the completed Checkout Test Case.',
          ).toContain('Checkout completes an approved order');
          expect(
            output,
            'Detailed output explains the named charge assertion.',
          ).toContain('charges the order');
          expect(
            output,
            'Detailed output shows the expected public checkout value.',
          ).toContain('expected: "charged"');
          expect(
            output,
            'Detailed output shows the Checkout span and inclusive duration.',
          ).toContain('checkout  38.4 ms');
          expect(
            output,
            'Terminal output never prints authored documentation.',
          ).not.toContain('This must never appear');
          expect(
            output,
            'Normal detailed output hides trace attributes.',
          ).not.toContain('orderId');
          expect(
            output,
            'Normal detailed output hides captured logs.',
          ).not.toContain('Charging order');
        },
      );

      laymosTest(
        'Shows trace metadata and logs in verbose output.',
        {
          description:
            'Verbose mode exposes the complete execution story retained by the Test Trace.',
        },
        ({ expect }) => {
          const output = renderTestsReport(report, {
            color: false,
            detailed: true,
            verbose: true,
          });

          expect(
            output,
            'Verbose output shows the Checkout order identifier attribute.',
          ).toContain('orderId: "order-1"');
          expect(
            output,
            'Verbose output shows the authorization span event.',
          ).toContain('authorized');
          expect(
            output,
            'Verbose output shows the log scoped to Checkout.',
          ).toContain('Charging order');
          expect(
            output,
            'Verbose output labels logs emitted outside a captured span.',
          ).toContain('Unscoped logs');
          expect(
            output,
            'Verbose output shows the unscoped checkout-start log.',
          ).toContain('Starting checkout');
          expect(
            output,
            'Verbose terminal output still hides authored documentation.',
          ).not.toContain('This must never appear');
        },
      );

      laymosTest(
        'Renders a zero-case summary for an unmatched query.',
        {
          description:
            'A targeted run with no matching Test Case remains a readable completed result.',
        },
        ({ expect }) => {
          const output = renderTestsReport(report, {
            color: false,
            detailed: true,
            nameQuery: 'missing case',
            verbose: false,
          });

          expect(
            output,
            'The unmatched query reports no selected assertion or trace evidence.',
          ).toContain('0 assertions · 0 spans');
          expect(
            output,
            'The unmatched query does not render an unrelated Checkout case.',
          ).not.toContain('Checkout completes an approved order');
        },
      );
    },
  );
});
