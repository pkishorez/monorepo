# Lint rules

Every oxlint rule this monorepo turns on, and why. `@kestack/monoverse/oxlint`
exports them as `rules`, and the root `vite.config.ts` turns them on for the
packages that follow them so far: `devtools/devtools` and `devtools/monoverse`.
The [Imports and exports](#imports-and-exports) rules are on for every package.

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

## Imports and exports

A file names what it takes from another file and what it gives. Reading the
top of a file then tells which names it uses, and reading an index file tells
what its module exposes, with no file to open behind a `*`.

### `monoverse/no-star`

Reports `import * as Name from './x'` and `export *` and `export * as Name`
of the package's own files: a path starting with `.`, `/` or `#`. Import and
export them by name.

An import from a package is not judged: `import * as Cloudflare from
'@alchemy.run/cloudflare'` stays. Libraries such as Alchemy are written to be
read as `Cloudflare.Worker` or `Provider.succeed`, and their plain names would
clash with globals (`Worker`, `WebSocket`) or lose their meaning (`succeed`).
Effect's modules are imported from the package's root by name,
`import { Effect, Option } from 'effect'`, which Rolldown tree-shakes to the
same bundle as `import * as Effect from 'effect/Effect'`.

When two files export the same name, such as each Service's `layer`, the
importing file gives each its own name: `import { layer as locksLayer }`.

`export * as Name from './x/index.ts'` is the exception, not the norm: a
package that publishes a namespace, such as use-gesture's `Swipe` and
`TreeWalk`, turns the rule off on that line and says so, as
`// oxlint-disable-next-line monoverse/no-star -- an exception: …`. The
namespace's own index file still names every member.

### Few exports, a guideline for now

An entry point exports as few names as it can. A long list of loose names
overwhelms whoever reads it; a few namespaces, each with a few members, read
like a table of contents. Kabuki's root is the shape to aim for: a handful
of namespaces and no loose types.

It is not a lint rule yet, because a cap today would fail about a dozen
entry points at once (laymos has 37 values and 35 types, `ai-toolkit/contract`
28 and 26). When it becomes one, it belongs in `monoverse lint`, which knows a
package's entry points from its `package.json` `exports`.

### `monoverse/values-before-types`

In an index file, every value export comes before every type export, so the
file reads as two sections: what the module does, then the types it describes
them with. A class or an enum is a value. One statement does not mix the two:
`export { a, type A } from './a.ts'` is split into `export { a }` and
`export type { A }`.

It judges only index files. In any other file a type sits next to the code
that uses it.

## Weighed and not taken

- `no-inline-comments` and `no-warning-comments` (`TODO`, `FIXME`):
  `monoverse/no-comments` covers both.
- `capitalized-comments`: style only.
- `import/no-namespace`: turning on oxlint's `import` plugin replaces its
  default plugins and turns on the plugin's other rules, and it judges a
  package's entry points too. `monoverse/no-star` covers imports and exports
  with one message.
- A `types.ts` beside each `index.ts`, holding the module's types: every
  caller would import a module twice, and a module of types only would need an
  empty index. `monoverse/values-before-types` keeps the index readable
  instead.
- anti-slop's `require-safety-comment-for-type-assertion`: it asks for a
  comment on every type assertion. Unsafe assertions are better banned than
  explained.
- `eslint-plugin-no-comments`: the same ban, but its autofix deletes comments
  during the commit hook.
