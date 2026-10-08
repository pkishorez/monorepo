# laymos CLI

Every command takes `--config <path>`. It defaults to `./laymos.config.json`,
and project-relative paths resolve from the config file's directory.

```sh
laymos [--config <path>] lint
laymos [--config <path>] lint layers
laymos [--config <path>] lint modules
laymos [--config <path>] inspect project [--json]
laymos [--config <path>] inspect layer <layer-name> [--json]
laymos [--config <path>] inspect file <file-path> [--recursive] [--json]
laymos [--config <path>] inspect module <module-path> [--json]
laymos [--config <path>] stories [scope] [--concurrency <n>]
laymos skills [<name>] [--install <dir>] [--format json|text]
```

## Exit codes

| Code | Meaning                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| `0`  | No violations, or every Proof passed.                                          |
| `1`  | Violations found, a Proof did not pass, or the inspected Module is in a cycle. |
| `2`  | Invalid configuration or an analysis failure.                                  |

## lint

`lint` runs every check. `lint layers` checks Layer coverage (every file has a
Layer), that each Layer has at least one Module, and cross-Layer dependency
rules. `lint modules` checks Module coverage, entry points, dependencies,
public boundaries, unused Shared Modules, and cycles. When `storiesPath` is
set, `lint` also reports every Telling issue (a Story folder without a
`story.md`, a Telling without a `#` title or a pitch, a link to a Story or
Proof that does not exist, a sub-Story its parent never links) and every
Proof that is not Self-contained: a Proof file with a relative import (`./`,
`../`). Each is a violation. Proof files are not imported to find them.

## inspect

`inspect project` summarizes the whole architecture. `inspect layer` takes an
exact Layer name and reports its paths, allowed Layer links, Modules, Shared
count, and violations. `inspect module` takes an exact Configured Module path
and prints its configured visibility, source shape, observed kind, public entry
points, and dependency tree. If the Module is part of a dependency cycle,
inspection stops and points to `lint modules`.

`inspect file` takes an exact included source file and prints its Layer,
Configured Module, public-boundary role, and dependencies as a colored path
tree. Direct dependencies are yellow; with `--recursive`, transitive ones are
gray. The inspected target is green. Files with missing Layer or Module
membership are still inspectable and show a coverage warning.

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
