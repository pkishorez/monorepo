import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from '../oxlint/index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const rule = plugin.rules['no-comments']!;
const ts = { filename: 'file.ts' };
const tsx = { filename: 'file.tsx' };

new RuleTester().run('no-comments', rule, {
  valid: [
    { ...ts, code: 'export const a = 1;' },
    { ...ts, code: '#!/usr/bin/env node\nexport const a = 1;' },
    {
      ...ts,
      code: '// oxlint-disable-next-line no-console -- the CLI prints\nconsole.log(1);',
    },
    {
      ...ts,
      code: 'console.log(1); // oxlint-disable-line no-console -- the CLI prints',
    },
    {
      ...ts,
      code: '/* oxlint-disable no-console, no-debugger -- a REPL */\nconsole.log(1);\n/* oxlint-enable no-console, no-debugger */',
    },
    {
      ...ts,
      code: '// @ts-expect-error the old lib has no types\nimport a from "a";',
    },
    { ...ts, code: '/// <reference types="vite/client" />\nexport {};' },
    { ...ts, code: 'await import(/* @vite-ignore */ path);' },
    { ...ts, code: 'export const a = /* #__PURE__ */ make();' },
    { ...ts, code: 'export const a = /* @__PURE__ */ make();' },
    {
      ...ts,
      code: "export const url = 'https://example.com // not a comment';",
    },
  ],
  invalid: [
    {
      ...ts,
      code: '// narrated\nexport const a = 1;',
      errors: [{ messageId: 'comment', line: 1 }],
    },
    {
      ...ts,
      code: '/** doc */\nexport const a = 1;',
      errors: [{ messageId: 'comment' }],
    },
    {
      ...ts,
      code: '/* block */\nexport const a = 1;',
      errors: [{ messageId: 'comment' }],
    },
    {
      ...ts,
      code: 'export const a = 1; // trailing',
      errors: [{ messageId: 'comment' }],
    },
    {
      ...ts,
      code: '// TODO: later\nexport {};',
      errors: [{ messageId: 'comment' }],
    },
    {
      ...ts,
      code: '// eslint-disable-next-line no-console -- old style\nconsole.log(1);',
      errors: [{ messageId: 'comment' }],
    },
    {
      ...tsx,
      code: 'export const A = () => <div>{/* slot */}</div>;',
      errors: [{ messageId: 'comment' }],
    },
    {
      ...ts,
      code: '// oxlint-disable-next-line no-console\nconsole.log(1);',
      errors: [{ messageId: 'directiveWithoutReason' }],
    },
    {
      ...ts,
      code: '// oxlint-disable-next-line -- no rule named\nconsole.log(1);',
      errors: [{ messageId: 'directiveWithoutReason' }],
    },
    {
      ...ts,
      code: 'export {};\n/* oxlint-disable monoverse/no-comments -- keep these notes */',
      errors: [{ messageId: 'disablesItself', data: { line: '2' }, line: 1 }],
    },
    {
      ...ts,
      code: '// first\n// second\nexport {};',
      errors: [
        { messageId: 'comment', line: 1 },
        { messageId: 'comment', line: 2 },
      ],
    },
  ],
});
