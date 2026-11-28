import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from '../oxlint/index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const rule = plugin.rules['values-before-types']!;
const index = { filename: 'src/feature/index.ts' };

new RuleTester().run('values-before-types', rule, {
  valid: [
    {
      ...index,
      code: "export { a } from './a.ts';\nexport const b = 1;\nexport class C {}\nexport enum D { E }\nexport type { A } from './a.ts';\nexport interface F {}\nexport type G = string;",
    },
    { ...index, code: "export type { A } from './a.ts';" },
    { ...index, code: "export { a } from './a.ts';" },
    {
      ...index,
      code: "import type { A } from './a.ts';\nexport const a = 1;\nexport type { A };",
    },
    {
      filename: 'src/feature/feature.ts',
      code: 'export interface A {}\nexport const a = 1;',
    },
    {
      filename: 'src/feature/index.tsx',
      code: 'export const A = () => null;\nexport type B = string;',
    },
  ],
  invalid: [
    {
      ...index,
      code: "export type { A } from './a.ts';\nexport { a } from './a.ts';",
      errors: [{ messageId: 'valueAfterType', line: 2 }],
    },
    {
      ...index,
      code: 'export interface A {}\nexport const a = 1;\nexport class B {}',
      errors: [
        { messageId: 'valueAfterType', line: 2 },
        { messageId: 'valueAfterType', line: 3 },
      ],
    },
    {
      ...index,
      code: "export { a, type A } from './a.ts';",
      errors: [{ messageId: 'mixed' }],
    },
    {
      filename: 'src/feature/index.tsx',
      code: 'export type B = string;\nexport default function A() { return null; }',
      errors: [{ messageId: 'valueAfterType', line: 2 }],
    },
  ],
});
