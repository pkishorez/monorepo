# Lint rules

Every oxlint rule this monorepo turns on, and why. `@kestack/monoverse/oxlint`
exports them as `rules`, and the root `vite.config.ts` turns them on for the
packages that follow them so far: `devtools/devtools` and `devtools/monoverse`.

A rule is added only with its reason here. A rule that stops paying for itself
is removed, and its section goes with it.

## Comments

The code holds no comments. A comment that repeats the code goes stale and
then lies. A comment that explains a surprise means the code should change
until it is not a surprise: a name, a type, a function, a test. What the code
cannot show, such as a limit imposed by a browser, a library or a protocol,
goes in the package's `docs/`.

A limit such as "two comments per file" was weighed and dropped. No linter
offers it, a lint rule cannot tell a useful comment from noise, and a budget
lets the noise through.

### `monoverse/no-comments`

Reports every comment: `//`, `/* */`, `/** */`, a comment after code on the
same line, and `{/* */}` in JSX. It allows only the comments a tool reads:

- `oxlint-disable…` directives that name the rules they turn off and say why
  after `--`, such as `// oxlint-disable-next-line no-console -- the CLI prints`.
  `oxlint-enable` needs no reason.
- TypeScript directives: `// @ts-expect-error`, judged by
  `typescript/ban-ts-comment` below.
- Triple-slash references: `/// <reference types="vite/client" />`.
- Bundler hints: `/* @vite-ignore */`, `/* #__PURE__ */`, `/* @__PURE__ */`,
  `/* #__NO_SIDE_EFFECTS__ */` and `/* @__NO_SIDE_EFFECTS__ */`.
- A shebang line.

`eslint-disable` is reported: oxlint reads it, but one spelling is enough.

The rule cannot be turned off. A directive naming `monoverse/no-comments` is
an error, reported on the file's first line so a file-wide directive cannot
hide it. It has no autofix on purpose: the commit hook runs `vp check --fix`,
and a note that belongs in `docs/` must not vanish unread.

### `typescript/ban-ts-comment`

Bans `@ts-ignore` and `@ts-nocheck`, and requires a description on
`@ts-expect-error`. `@ts-ignore` stays silent when the error it hid is gone, so
it outlives its reason; `@ts-expect-error` fails then.

### `unicorn/no-abusive-eslint-disable`

Reports an `oxlint-disable` that names no rule. A bare directive turns off
every rule for the line or the file, including ones that catch real bugs.

### `react/jsx-no-comment-textnodes`

Reports `// text` written as a JSX child. It renders as visible text, which is
a bug, not a comment.

### Unused disable directives

`options.reportUnusedDisableDirectives` reports a directive that no longer
turns anything off. Oxlint reads it only from the root config, so it applies
to the whole repository and stays a warning until every package follows these
rules.

## Weighed and not taken

- `no-inline-comments` and `no-warning-comments` (`TODO`, `FIXME`):
  `monoverse/no-comments` covers both.
- `capitalized-comments`: style only.
- anti-slop's `require-safety-comment-for-type-assertion`: it asks for a
  comment on every type assertion. Unsafe assertions are better banned than
  explained.
- `eslint-plugin-no-comments`: the same ban, but its autofix deletes comments
  during the commit hook.
