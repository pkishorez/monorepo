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
laymos [--config <path>] stories [--concurrency <n>]
laymos skills [<name>] [--install <dir>] [--format json|text]
```

## Exit codes

| Code | Meaning                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| `0`  | No violations, or every Story passed.                                          |
| `1`  | Violations found, a Story did not pass, or the inspected Module is in a cycle. |
| `2`  | Invalid configuration or an analysis failure.                                  |

## lint

`lint` runs every check. `lint layers` checks Layer coverage (every file has a
Layer), that each Layer has at least one Module, and cross-Layer dependency
rules. `lint modules` checks Module coverage, entry points, dependencies,
public boundaries, unused Shared Modules, and cycles. `lint` also reports Story
Groups without a Story page when `storiesPath` is set.

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

`stories` loads the Story tree from `storiesPath`, runs every Story with the
given concurrency (default 16), prints each verdict, and exits `1` if any Story
did not pass. Each Story gets `storyTimeout` from the config unless it sets its
own.

## skills

`skills` lists the agent skills shipped with laymos: `laymos`, `to-laymos`,
`domain-modeling`, and `deep-module`. `skills <name>` prints that skill's
`SKILL.md`. `--install <dir>` copies every skill, or only the named one, into
`<dir>/<name>/` with its reference files, overwriting an existing copy. Re-run
it after upgrading so the installed skills match the CLI.

The same command builder is exported as `laymos/skills-command` and powers
`kstack skills`.
