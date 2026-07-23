import { useState } from 'react';
import type { TestCatalog, TestPath, TestsReport } from 'laymos/report';

import { LaymosTests } from '../laymos-tests';

const testPath = 'src/checkout/laymos/normalize-order';

const catalog: TestCatalog = {
  modules: [
    {
      modulePath: 'src/checkout',
      description: 'Checkout',
      tests: [
        {
          testPath,
          testKey: 'normalize-order',
          modulePath: 'src/checkout',
          name: 'Normalize an order',
          description:
            'Checks how raw order values become stable application input.',
          cases: [
            {
              kind: 'positive',
              name: 'normalizes source code',
              description: 'Formats compact source into stable TypeScript.',
              inputs: ['const total=2+3'],
              expected: {
                kind: 'value',
                value: 'const total = 2 + 3;',
              },
            },
            {
              kind: 'positive',
              name: 'preserves Markdown',
              description: 'Leaves already-normalized Markdown unchanged.',
              inputs: ['# Checkout\n\n- paid'],
              expected: {
                kind: 'value',
                value: '# Checkout\n\n- paid',
              },
            },
            {
              kind: 'negative',
              name: 'rejects empty input',
              description: 'Reports the named error for missing source.',
              inputs: [''],
              expected: { kind: 'error', name: 'EmptyOrder' },
            },
          ],
        },
      ],
    },
  ],
};

const report: TestsReport = {
  tests: {
    [testPath]: {
      ...catalog.modules[0]!.tests[0],
      cases: [
        {
          ...catalog.modules[0]!.tests[0].cases[0]!,
          actual: { kind: 'value', value: 'const total = 2+3;' },
        },
        {
          ...catalog.modules[0]!.tests[0].cases[1]!,
          actual: { kind: 'value', value: '# Checkout\n\n- paid' },
        },
        {
          ...catalog.modules[0]!.tests[0].cases[2]!,
          actual: { kind: 'error', name: 'EmptyOrder' },
        },
      ],
    },
  },
};

export default function LaymosTestsFixture() {
  const [selection, setSelection] = useState<TestPath | null>(testPath);

  return (
    <div className="h-[720px] p-6">
      <LaymosTests
        catalog={catalog}
        report={report}
        selectedTestPath={selection}
        onSelectedTestPathChange={setSelection}
        onRunAll={() => undefined}
        onRunTest={() => undefined}
      />
    </div>
  );
}
