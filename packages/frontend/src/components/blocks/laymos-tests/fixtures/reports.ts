import type { TestsReport } from 'laymos/report';

export const comprehensiveReport: TestsReport = {
  status: 'failed',
  duration: 84.2,
  unhandledErrors: [],
  modules: [
    {
      id: 'checkout-module',
      name: 'checkout.test.ts',
      path: 'src/checkout/checkout.test.ts',
      projectName: 'unit',
      status: 'failed',
      duration: 84.2,
      errors: [],
      cases: [
        {
          id: 'ordinary-test',
          name: 'exports the public API',
          fullName: 'exports the public API',
          status: 'passed',
          duration: 1.2,
          errors: [],
        },
      ],
      suites: [
        {
          id: 'checkout-suite',
          name: 'Checkout',
          description: 'Explains how checkout decisions reach payment.',
          documentation: '## Checkout\n\nEvery route has one terminal outcome.',
          status: 'failed',
          errors: [],
          suites: [],
          cases: [
            {
              id: 'checkout-routes',
              name: 'routes checkout decisions',
              fullName: 'Checkout > routes checkout decisions',
              status: 'failed',
              duration: 83,
              errors: [],
              authoredBy: 'laymos',
              evidence: {
                description:
                  'Runs the common checkout routes and records each outcome.',
                documentation:
                  '## Routes\n\nApproved orders charge; rejected orders stop.',
                assertions: [
                  {
                    name: 'charges approved orders',
                    matcher: 'toBe',
                    status: 'passed',
                    actual: 'charged',
                    expected: 'charged',
                  },
                  {
                    name: 'declines rejected orders',
                    matcher: 'toBe',
                    status: 'failed',
                    actual: 'pending',
                    expected: 'declined',
                    error: {
                      name: 'AssertionError',
                      message: 'expected "pending" to be "declined"',
                    },
                  },
                ],
                trace: {
                  logs: [],
                  spans: [
                    {
                      traceId: 'trace-1',
                      spanId: 'checkout',
                      parentSpanId: null,
                      name: 'checkout',
                      startTime: 0,
                      endTime: 18,
                      status: 'error',
                      attributes: { route: 'rejected' },
                      events: [],
                    },
                    {
                      traceId: 'trace-1',
                      spanId: 'payment',
                      parentSpanId: 'checkout',
                      name: 'payment',
                      startTime: 2,
                      endTime: 12,
                      status: 'success',
                      attributes: {},
                      events: [],
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export const passingReport: TestsReport = {
  ...comprehensiveReport,
  status: 'passed',
  modules: comprehensiveReport.modules.map((module) => ({
    ...module,
    status: 'passed',
    suites: module.suites.map((suite) => ({
      ...suite,
      status: 'passed',
      cases: suite.cases.map((testCase) => ({
        ...testCase,
        status: 'passed',
        evidence: testCase.evidence
          ? {
              ...testCase.evidence,
              assertions: testCase.evidence.assertions.map((assertion) => ({
                ...assertion,
                status: 'passed',
                actual: assertion.expected,
                error: undefined,
              })),
            }
          : undefined,
      })),
    })),
  })),
};

export const jsonDiffReport = comprehensiveReport;

export const emptyReport: TestsReport = {
  status: 'passed',
  duration: 0,
  unhandledErrors: [],
  modules: [],
};
