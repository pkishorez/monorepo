import type { VTestReport } from '@monorepo/vtest/types';

import liveReport from '../../../../vtest/report.json';

import { VTestDocs } from './index';

const homeMd = `
# @example/parse-range

Parses range expressions like \`1..5\` and \`-3..<0\` into number arrays.
Designed to be the smallest sensible building block for slicing, pagination,
and DSL parsing where users want to write a range *as a string*.

## Architecture

\`\`\`mermaid
flowchart LR
  Input(["source string"]) --> Tokenize
  Tokenize --> Validate{valid?}
  Validate -- yes --> Emit(["number array"])
  Validate -- no --> Err([ParseError])
\`\`\`

## Install

\`\`\`bash
pnpm add @example/parse-range
\`\`\`

## Quick start

\`\`\`ts
import { parseRange } from '@example/parse-range';

parseRange('1..5');   // [1, 2, 3, 4, 5]
parseRange('1..<5');  // [1, 2, 3, 4]
parseRange('-2..2');  // [-2, -1, 0, 1, 2]
\`\`\`

## Why another range parser?

Most existing libraries either:

1. Only handle inclusive ranges
2. Throw on negative endpoints
3. Pull in a 200kb DSL dependency

This package is **\\< 2 kb min+gz** with zero runtime dependencies.

> The grammar is documented inline alongside the property tests — every
> behaviour you read about is the test that just ran.
`;

const parseRangeDoc = `---
title: parseRange
---

# parseRange

Turns a range literal into a flat array of numbers. The grammar supports both
**inclusive** (\`a..b\`) and **exclusive** (\`a..<b\`) endpoints, and both
endpoints may be negative.

## Grammar

\`\`\`ebnf
range      = endpoint ".." [ "<" ] endpoint
endpoint   = [ "-" ] DIGIT { DIGIT }
\`\`\`

The parser is hand-rolled (no regex backtracking, no parser combinator
dependency) so it stays under 1kb gzipped.

## Returned shape

| Input        | Output             |
| ------------ | ------------------ |
| \`'1..5'\`     | \`[1, 2, 3, 4, 5]\`  |
| \`'1..<5'\`    | \`[1, 2, 3, 4]\`     |
| \`'-2..2'\`    | \`[-2, -1, 0, 1, 2]\` |
| \`'5..5'\`     | \`[5]\`              |

> Behaviour is verified by the trial cases below — each one is the actual
> test that just executed.
`;

const inclusiveSuiteDoc = `
Inclusive ranges include both endpoints. The syntax is \`a..b\` and the
result has \`b - a + 1\` elements.

\`\`\`ts
parseRange('1..3'); // [1, 2, 3]
\`\`\`
`;

const negativeTestDoc = `
Both endpoints can be negative; the iterator walks forward through zero
without special-casing.

**Examples**

- \`'-3..0'\` → \`[-3, -2, -1, 0]\`
- \`'-2..2'\` → \`[-2, -1, 0, 1, 2]\`
- \`'-5..-3'\` → \`[-5, -4, -3]\`

The result is always sorted ascending — descending input is rejected by
\`'errors / rejects descending ranges'\`.
`;

const exclusiveTestDoc = `
Returns an array containing \`a\` through \`b - 1\`.

> Exclusive endpoints are useful when you want \`length === b - a\` — most
> commonly when you're slicing into a fixed-size buffer.

\`\`\`ts
const slice = (xs: T[], a: number, b: number) =>
  parseRange(\`\${a}..<\${b}\`).map(i => xs[i]);
\`\`\`
`;

const failingTestDoc = `
When \`a === b\`, the result should be \`[]\` since the upper bound is
excluded. The current implementation incorrectly includes \`a\` — see the
assertion below.

**Open question:** should this throw \`RangeError\` instead of returning an
empty array? RFC pending.
`;

const errorsSuiteDoc = `
The grammar is strict — anything outside the documented forms throws
\`ParseError\` with a position offset. Errors include:

| Code           | Cause                                    |
| -------------- | ---------------------------------------- |
| \`E_SYNTAX\`     | Token didn't match the grammar           |
| \`E_DESCEND\`    | \`a > b\` (decide via the pending RFC)     |
| \`E_NON_INT\`    | Decimal endpoints (pending decimal RFC)  |
`;

const serializeDoc = `---
title: serialize
---

# serialize

Converts a parsed range back into its canonical source form.

\`\`\`ts
serialize([1, 2, 3, 4, 5]);   // '1..5'
serialize([1, 2, 3, 4]);      // '1..<5'
\`\`\`

The function is **lossy** for arrays that aren't contiguous — it always
returns the *shortest* canonical form covering the array's bounds.
`;

const intersectDoc = `---
title: intersect
---

# intersect

Returns the overlap between two parsed ranges, or an empty array when they
don't intersect.

\`\`\`ts
intersect(parseRange('1..10'), parseRange('5..15')); // [5..10]
intersect(parseRange('1..3'),  parseRange('5..7'));  // []
\`\`\`

Linear in the size of the smaller range. For very large ranges, prefer
\`intersectBounds\` (numeric, O(1)) instead.
`;

const formatNumberDoc = `---
title: formatNumber
---

# formatNumber

Locale-aware number formatter wrapping \`Intl.NumberFormat\` with sane
defaults and a tiny memoisation cache (last 16 locale/option combos).

## Defaults

| Option              | Value         |
| ------------------- | ------------- |
| \`maximumFractionDigits\` | \`2\`           |
| \`useGrouping\`         | \`true\`        |
| \`numberingSystem\`     | from locale  |

\`\`\`ts
formatNumber(1234567.89);          // '1,234,567.89'
formatNumber(0.5, { style: 'percent' }); // '50%'
\`\`\`

> The cache is intentionally tiny — formatters are cheap to construct on
> modern engines and a large cache hurts startup memory more than it helps.
`;

const formatRelativeDoc = `---
title: formatRelative
---

# formatRelative

Returns a human-readable relative-time string (\`"3 minutes ago"\`,
\`"in 2 days"\`) using the platform \`Intl.RelativeTimeFormat\`.

## Usage

\`\`\`ts
formatRelative(Date.now() - 60_000);  // '1 minute ago'
formatRelative(Date.now() + 86_400_000 * 2); // 'in 2 days'
\`\`\`

Crosses unit boundaries automatically: a 90-minute delta returns
\`'1 hour ago'\`, not \`'90 minutes ago'\`.
`;

const tokenizeDoc = `---
title: tokenize
---

# tokenize

The internal lexer used by \`parseRange\`. Exposed for callers that want to
inspect the token stream without paying for the full parse.

\`\`\`ts
tokenize('1..<5'); // [Num(1), Dots, Lt, Num(5)]
\`\`\`

Returns an iterator — large inputs don't materialise the whole stream.
`;

const parserFolderDoc = `
# Parser

The string-to-AST pipeline. Three modules cooperate here:

| Module       | Role                                                          |
| ------------ | ------------------------------------------------------------- |
| \`tokenize\`   | Hand-rolled lexer; streams tokens lazily                     |
| \`parse-range\`| Validates token stream against the grammar; emits an array  |
| \`serialize\`  | Reverses the parse — turns an array back into source form   |

> All three are pure functions. No I/O, no globals. Each module's tests
> double as its public-API documentation — open one to see the contract.

## Correctness story

We rely on three layers:

1. **Hand-written examples** for every documented behaviour
2. **Property-based tests** (\`fast-check\`) for round-trip invariants
3. **Fuzzing** in CI for crash-resistance under malformed input

The grammar lives in code (in \`tokenize.ts\`) — there is no separate
specification document because the tests *are* the spec.
`;

const formatFolderDoc = `
# Format

Locale-aware formatters. Wrap the platform \`Intl.*\` APIs with sane
defaults and a small caching layer to avoid reconstructing formatters in
hot paths.

\`\`\`ts
import { formatNumber, formatRelative } from '@example/parse-range/format';

formatNumber(1234.5);                  // '1,234.5'
formatRelative(Date.now() - 3_600_000); // '1 hour ago'
\`\`\`

## Modules

- **formatNumber** — wraps \`Intl.NumberFormat\`; LRU cache of 16 entries
- **formatRelative** — wraps \`Intl.RelativeTimeFormat\`; auto-picks the
  largest unit where \`|delta| ≥ 1\`

> These are intentionally *thin* wrappers — they exist so the rest of the
> codebase doesn't repeat the same options object everywhere, not to hide
> the platform API.
`;

const opsFolderDoc = `
# Operations

Set-style operations over parsed ranges.

Currently exported:

- \`intersect(a, b)\` — overlap of two ranges; \`[]\` when disjoint
- \`intersectBounds(a, b)\` — \`O(1)\` numeric variant for very large ranges

Coming next: \`union\`, \`difference\`, \`subtract\`. See the open RFC
in \`docs/rfcs/0003-set-ops.md\`.
`;

const sample: VTestReport = {
  package: {
    name: '@example/parse-range',
    version: '0.4.2',
    description:
      'Tiny range-expression parser with inclusive, exclusive, and negative endpoints.',
  },
  home: homeMd,
  folders: [
    { path: 'vtest/parser', doc: parserFolderDoc },
    { path: 'vtest/format', doc: formatFolderDoc },
    { path: 'vtest/ops', doc: opsFolderDoc },
  ],
  files: [
    {
      kind: 'file',
      name: 'parse-range',
      filepath: 'vtest/parser/parse-range.test.ts',
      doc: parseRangeDoc,
      children: [
        {
          kind: 'suite',
          name: 'inclusive',
          doc: inclusiveSuiteDoc,
          children: [
            {
              kind: 'test',
              name: 'handles a basic inclusive range',
              status: 'pass',
              duration: 0.4,
              doc: 'Canonical case: returns `[a..b]` inclusive of both ends.',
            },
            {
              kind: 'test',
              name: 'handles negative endpoints',
              status: 'pass',
              duration: 0.3,
              doc: negativeTestDoc,
            },
            {
              kind: 'test',
              name: 'handles equal endpoints',
              status: 'pass',
              duration: 0.2,
              doc: 'When `a === b`, the result is a single-element array `[a]`.',
            },
            {
              kind: 'test',
              name: 'handles ranges spanning zero',
              status: 'pass',
              duration: 0.5,
              doc: 'Sanity check: `parseRange("-1..1")` returns `[-1, 0, 1]` — zero is included like any other integer.',
            },
          ],
        },
        {
          kind: 'suite',
          name: 'exclusive',
          doc: 'Exclusive ranges use `a..<b` and omit the upper bound.',
          children: [
            {
              kind: 'test',
              name: 'handles a..<b form',
              status: 'pass',
              duration: 0.3,
              doc: exclusiveTestDoc,
            },
            {
              kind: 'test',
              name: 'returns empty for equal endpoints',
              status: 'fail',
              duration: 1.2,
              doc: failingTestDoc,
              error: {
                message: 'expected [ 5 ] to deeply equal []',
                expected: '[]',
                actual: '[5]',
                stack:
                  'AssertionError: expected [ 5 ] to deeply equal []\n    at vtest/parser/parse-range.test.ts:42:30\n    at Suite.exclusive (vtest/parser/parse-range.test.ts:38:5)',
              },
            },
            {
              kind: 'test',
              name: 'works with negative bounds',
              status: 'pass',
              duration: 0.4,
              doc: '`parseRange("-3..<0")` returns `[-3, -2, -1]` — the upper bound `0` is excluded.',
            },
          ],
        },
        {
          kind: 'suite',
          name: 'errors',
          doc: errorsSuiteDoc,
          children: [
            {
              kind: 'test',
              name: 'rejects malformed input',
              status: 'pass',
              duration: 0.5,
              doc: 'Any input not matching the grammar throws `ParseError` with code `E_SYNTAX`.',
            },
            {
              kind: 'test',
              name: 'rejects descending ranges',
              status: 'todo',
              doc: 'Decide whether `5..1` should reverse, throw, or return `[]`. Tracking in [#42](#).',
            },
            {
              kind: 'test',
              name: 'rejects non-integer endpoints',
              status: 'skip',
              doc: 'Skipped pending decimal-range RFC — see `errors/decimal.md`.',
            },
            {
              kind: 'test',
              name: 'reports column offset in error',
              status: 'pass',
              duration: 0.6,
              doc: 'The thrown `ParseError` has a `.column` field pointing at the first invalid character. Useful for editor underlines.',
            },
          ],
        },
        {
          kind: 'suite',
          name: 'edge cases',
          children: [
            {
              kind: 'test',
              name: 'handles whitespace around dots',
              status: 'pass',
              duration: 0.3,
              doc: '`"1 .. 5"` parses identically to `"1..5"`.',
            },
            {
              kind: 'test',
              name: 'rejects more than two dots',
              status: 'pass',
              duration: 0.4,
            },
            {
              kind: 'test',
              name: 'handles MAX_SAFE_INTEGER endpoints',
              status: 'pass',
              duration: 12.4,
              doc: 'Large ranges materialise lazily via a `*[Symbol.iterator]` so memory usage stays flat.',
            },
          ],
        },
      ],
    },
    {
      kind: 'file',
      name: 'serialize',
      filepath: 'vtest/parser/serialize.test.ts',
      doc: serializeDoc,
      children: [
        {
          kind: 'test',
          name: 'round-trips inclusive ranges',
          status: 'pass',
          duration: 0.2,
          doc: '`serialize(parseRange(x)) === x` for all inclusive forms — verified across 1000 fast-check samples.',
        },
        {
          kind: 'test',
          name: 'round-trips exclusive ranges',
          status: 'pass',
          duration: 0.2,
        },
        {
          kind: 'test',
          name: 'collapses single-element arrays',
          status: 'pass',
          duration: 0.1,
          doc: '`serialize([7])` returns `"7..7"` rather than `"7"` — the canonical form is always a range, never a scalar.',
        },
      ],
    },
    {
      kind: 'file',
      name: 'tokenize',
      filepath: 'vtest/parser/tokenize.test.ts',
      doc: tokenizeDoc,
      children: [
        {
          kind: 'suite',
          name: 'happy path',
          children: [
            {
              kind: 'test',
              name: 'tokenises simple inclusive range',
              status: 'pass',
              duration: 0.2,
            },
            {
              kind: 'test',
              name: 'tokenises exclusive range',
              status: 'pass',
              duration: 0.2,
            },
            {
              kind: 'test',
              name: 'streams without materialising the array',
              status: 'pass',
              duration: 0.6,
              doc: 'Asserts that the iterator produces tokens incrementally and never builds a full array internally.',
            },
          ],
        },
        {
          kind: 'suite',
          name: 'failure modes',
          children: [
            {
              kind: 'test',
              name: 'reports unexpected character',
              status: 'pass',
              duration: 0.3,
            },
            {
              kind: 'test',
              name: 'reports unexpected EOF',
              status: 'fail',
              duration: 0.4,
              doc: 'Should report `E_EOF` at the final position, but currently reports `E_SYNTAX` at position 0.',
              error: {
                message: 'expected error.code to be "E_EOF" but got "E_SYNTAX"',
                expected: '"E_EOF"',
                actual: '"E_SYNTAX"',
                stack:
                  'AssertionError: expected error.code to be "E_EOF" but got "E_SYNTAX"\n    at vtest/parser/tokenize.test.ts:61:24',
              },
            },
          ],
        },
      ],
    },
    {
      kind: 'file',
      name: 'intersect',
      filepath: 'vtest/ops/intersect.test.ts',
      doc: intersectDoc,
      children: [
        {
          kind: 'test',
          name: 'overlapping ranges',
          status: 'pass',
          duration: 0.3,
          doc: 'Returns the inclusive overlap of two ranges that share at least one element.',
        },
        {
          kind: 'test',
          name: 'disjoint ranges',
          status: 'pass',
          duration: 0.2,
          doc: 'Returns `[]` when the ranges do not overlap. Order of arguments does not matter.',
        },
        {
          kind: 'test',
          name: 'one range fully contains the other',
          status: 'pass',
          duration: 0.2,
        },
        {
          kind: 'test',
          name: 'handles single-element overlap',
          status: 'pass',
          duration: 0.2,
          doc: 'When two ranges touch at exactly one point, the result is that single point — `intersect([1..3], [3..5]) === [3]`.',
        },
      ],
    },
    {
      kind: 'file',
      name: 'format-number',
      filepath: 'vtest/format/format-number.test.ts',
      doc: formatNumberDoc,
      children: [
        {
          kind: 'suite',
          name: 'defaults',
          children: [
            {
              kind: 'test',
              name: 'formats integers',
              status: 'pass',
              duration: 0.3,
            },
            {
              kind: 'test',
              name: 'formats decimals to 2 places',
              status: 'pass',
              duration: 0.2,
              doc: 'Default `maximumFractionDigits` is `2`; trailing zeroes are dropped.',
            },
            {
              kind: 'test',
              name: 'inserts grouping separators',
              status: 'pass',
              duration: 0.3,
              doc: '`1234567` formats as `"1,234,567"` in `en-US`, `"1.234.567"` in `de-DE`.',
            },
          ],
        },
        {
          kind: 'suite',
          name: 'styles',
          children: [
            {
              kind: 'test',
              name: 'percent style',
              status: 'pass',
              duration: 0.3,
            },
            {
              kind: 'test',
              name: 'currency style',
              status: 'pass',
              duration: 0.4,
              doc: 'Requires a `currency` option; throws `RangeError` if missing.',
            },
            {
              kind: 'test',
              name: 'unit style with compound units',
              status: 'todo',
              doc: 'Pending Node 22 baseline — `Intl.NumberFormat` only added compound units in V8 11.6.',
            },
          ],
        },
        {
          kind: 'suite',
          name: 'cache',
          children: [
            {
              kind: 'test',
              name: 'reuses formatter for repeated locale/options',
              status: 'pass',
              duration: 0.4,
            },
            {
              kind: 'test',
              name: 'evicts oldest entry past 16',
              status: 'pass',
              duration: 0.5,
              doc: 'LRU policy. Verified by formatting 17 distinct locales and asserting the first one is reconstructed on the next call.',
            },
          ],
        },
      ],
    },
    {
      kind: 'file',
      name: 'format-relative',
      filepath: 'vtest/format/format-relative.test.ts',
      doc: formatRelativeDoc,
      children: [
        {
          kind: 'test',
          name: 'past times',
          status: 'pass',
          duration: 0.3,
        },
        {
          kind: 'test',
          name: 'future times',
          status: 'pass',
          duration: 0.3,
        },
        {
          kind: 'test',
          name: 'crosses unit boundaries',
          status: 'pass',
          duration: 0.4,
          doc: 'A 90-minute delta returns `"1 hour ago"`, not `"90 minutes ago"` — picks the largest unit where the magnitude is `≥ 1`.',
        },
        {
          kind: 'test',
          name: 'right now',
          status: 'pass',
          duration: 0.2,
          doc: 'A delta of `0` returns the locale-specific *"now"* string (e.g. `"now"` in `en`, `"maintenant"` in `fr`).',
        },
        {
          kind: 'test',
          name: 'handles future leap-second edge case',
          status: 'skip',
          doc: "Skipped — depends on the host platform's leap-second handling, which is not stable across Node versions.",
        },
      ],
    },
  ],
  summary: {
    total: 36,
    passed: 30,
    failed: 2,
    skipped: 4,
    durationMs: 28,
    startedAt: '2026-05-16T12:00:00.000Z',
    finishedAt: '2026-05-16T12:00:00.028Z',
  },
};

const minimal: VTestReport = {
  package: { name: '@example/tiny', version: '0.0.1' },
  files: [
    {
      kind: 'file',
      name: 'tiny',
      filepath: 'vtest/tiny.test.ts',
      children: [
        { kind: 'test', name: 'works', status: 'pass', duration: 0.1 },
      ],
    },
  ],
  summary: {
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    durationMs: 1,
    startedAt: '2026-05-16T12:00:00.000Z',
    finishedAt: '2026-05-16T12:00:00.001Z',
  },
};

export default {
  default: <VTestDocs report={liveReport as VTestReport} />,
  'edge cases': <VTestDocs report={sample} />,
  minimal: <VTestDocs report={minimal} />,
};
