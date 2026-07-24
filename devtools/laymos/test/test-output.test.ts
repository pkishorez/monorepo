import { describe, expect, it } from 'vitest';

import type { TestsReport } from '../src/report/tests.js';
import {
  renderTestsReport,
  selectedTestCases,
} from '../src/entrypoints/cli/test-output.js';

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

describe('test CLI output', () => {
  it('matches test names case-insensitively by literal substring', () => {
    expect(selectedTestCases(report, 'APPROVED ORDER')).toHaveLength(1);
    expect(selectedTestCases(report, 'approved.*order')).toHaveLength(0);
  });

  it('shows readable evidence while hiding documentation and trace metadata', () => {
    const output = renderTestsReport(report, {
      color: false,
      detailed: true,
      verbose: false,
    });

    expect(output).toContain('Checkout completes an approved order');
    expect(output).toContain('charges the order');
    expect(output).toContain('expected: "charged"');
    expect(output).toContain('checkout  38.4 ms');
    expect(output).not.toContain('This must never appear');
    expect(output).not.toContain('orderId');
    expect(output).not.toContain('Charging order');
  });

  it('shows trace attributes, events, and scoped and unscoped logs when verbose', () => {
    const output = renderTestsReport(report, {
      color: false,
      detailed: true,
      verbose: true,
    });

    expect(output).toContain('orderId: "order-1"');
    expect(output).toContain('authorized');
    expect(output).toContain('Charging order');
    expect(output).toContain('Unscoped logs');
    expect(output).toContain('Starting checkout');
    expect(output).not.toContain('This must never appear');
  });
});
