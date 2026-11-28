import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from '../oxlint/index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const rule = plugin.rules['no-star']!;
const ts = { filename: 'file.ts' };

new RuleTester().run('no-star', rule, {
  valid: [
    { ...ts, code: "import { Effect, Option } from 'effect';" },
    { ...ts, code: "import type { Layer } from 'effect';" },
    { ...ts, code: "import React, { useState } from 'react';" },
    { ...ts, code: "export { a, b } from './a.ts';" },
    { ...ts, code: "export type { A } from './a.ts';" },
    { ...ts, code: "export { default as page } from './page.mdx';" },
    { ...ts, code: "import * as Effect from 'effect/Effect';" },
    { ...ts, code: "import * as Cloudflare from '@alchemy.run/cloudflare';" },
    { ...ts, code: "export * from 'some-package';" },
  ],
  invalid: [
    {
      ...ts,
      code: "import * as Driver from './driver.ts';",
      errors: [{ messageId: 'importStar' }],
    },
    {
      ...ts,
      code: "import * as Real from '../real/index.ts';",
      errors: [{ messageId: 'importStar' }],
    },
    {
      ...ts,
      code: "import * as Alias from '#shared/alias';",
      errors: [{ messageId: 'importStar' }],
    },
    {
      ...ts,
      code: "import type * as Api from './api.ts';",
      errors: [{ messageId: 'importStar' }],
    },
    {
      ...ts,
      code: "import Page, * as All from './page.mdx';",
      errors: [{ messageId: 'importStar' }],
    },
    {
      ...ts,
      code: "export * from './a.ts';",
      errors: [{ messageId: 'exportStar' }],
    },
    {
      ...ts,
      code: "export * as Swipe from './swipe/index.ts';",
      errors: [{ messageId: 'exportStar' }],
    },
    {
      ...ts,
      code: "export type * from './types.ts';",
      errors: [{ messageId: 'exportStar' }],
    },
  ],
});
