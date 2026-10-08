# laymos CLI

Every command takes `--config <path>`. It defaults to `./laymos.config.json`,
and project-relative paths resolve from the config file's directory.

```sh
laymos [--config <path>] lint
laymos [--config <path>] inspect project [--json]
laymos [--config <path>] inspect module <path> [--json]
laymos [--config <path>] inspect file <file-path> [--recursive] [--json]
laymos [--config <path>] stories [scope] [--concurrency <n>]
laymos skills [<name>] [--install <dir>] [--format json|text]
```

## Exit codes

| Code | Meaning                                       |
| ---- | --------------------------------------------- |
| `0`  | No violations, or every Proof passed.         |
| `1`  | Violations found, or a Proof did not pass.    |
| `2`  | Invalid configuration or an analysis failure. |

## lint

`lint` classifies every import between two Modules: a Module's own file
reaching a nested Index, covered by a Rule, covered by an Exception, or a
Violation. It prints each Violation with its two files and the key that could
hold it (a Rule, an Exception with a Reason, or neither when the import
reaches a file that is no Index), the files no Module owns, and the Rules and
Exceptions no import uses. When `storiesPath` is set, it also reports every
Telling issue (a Story folder without a `story.md`, a Telling without a `#`
title or a pitch, a link to a Story or Proof that does not exist, a sub-Story
its parent never links) and every Proof that is not Self-contained: a Proof
file with a relative import (`./`, `../`). Each is a violation. Proof files are
not imported to find them.

## inspect

`inspect project` prints the Module tree (Modules green, File Modules cyan,
Wrappers dim), then every Rule and Exception. `inspect module` takes a Module
or Wrapper path and prints its shape, Index, nested Modules, its Reach (what
it may import, by which Rule or Exception), and its dependents and
dependencies as a path tree.

`inspect file` takes an analyzed source file and prints the Module owning it,
its role (Index or own file), and its dependencies as a colored path tree.
Direct dependencies are yellow; with `--recursive`, transitive ones are gray.
The inspected target is green. A file no Module owns is still inspectable and
shows a warning.

Add `--json` to any `inspect` command for stable tool output.

## stories

`stories` loads the Story tree from `storiesPath` and runs the Proofs in
`scope`: a Story id such as `my-app/sync` runs that Story's Proofs and
everything beneath it, a Proof id such as `my-app/sync/two-tabs` runs one
Proof, and no scope runs everything. The top Story's id is the Project's
folder name. Process Proofs run `--concurrency` at a time (default 16, alias
`-c`); browser Proofs share one Chromium and run two at a time.

It prints the Story tree by title, each Story with its Telling issues (`⚠`)
and one line per Proof: `✓` passed, `✗` failed, `!` errored, `○` unprepared,
with Critical Proofs marked and, when they did not pass, listed first. False
assertions and errors are shown under their Proof, then a summary with the
Telling issue count. It exits `1` if any Proof did not pass.

A process Proof gets `storyTimeout` from the config (default 10 seconds) and a
browser Proof 90 seconds, unless the Proof sets its own. Each run replaces
`.laymos/stories/<proof id>/` with the new Evidence.

## skills

`skills` lists the agent skills shipped with laymos: `laymos`, `to-laymos`,
`domain-modeling`, and `deep-module`. `skills <name>` prints that skill's
`SKILL.md`. `--install <dir>` copies every skill, or only the named one, into
`<dir>/<name>/` with its reference files, overwriting an existing copy. Re-run
it after upgrading so the installed skills match the CLI.

The same command builder is exported as `laymos/skills-command` and powers
`devtools skills`.
