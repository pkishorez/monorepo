# Charting

Status: works. Live npm and GitHub data, drawn as SVG instead of echarts.

## What was ported

Foldkit's `charting`: a dashboard of Foldkit's own numbers with three
charts (Adoption, Velocity, Ecosystem), a package and a period picker,
Refresh and Retry, repository figures, and a label for the datum last
clicked.

```
Charting (root)        Model { telemetry as AsyncData, choice, selectedDatumId }
                       Provides Choices (a Request); first fetch in the Lifetime,
                       refetch → Command asking Telemetry
└─ controls: Controls  Model { mode, packageId, period }; every choice → Choices.chose
telemetry/  Telemetry Capability and its Layer over npm and GitHub; weeks
chart/      the chart for a choice: a line or bars per week, a dependency graph
```

## Deviations

- **SVG, not echarts** (no new dependencies). There is no chart instance, so
  Foldkit's `MountChart` and `SyncChart` have no counterpart: the View draws
  the chart from the Model, which also makes it step with Time Travel.
  Tooltips are native `<title>`s; the graph is four nodes on a circle, not a
  force layout; no zoom.
- **Fewer API calls.** Foldkit reads the stargazers (up to 10 pages),
  contributors, issues, PRs and releases from GitHub. Unauthenticated GitHub
  allows 60 calls an hour, so this reads the repository and commit activity
  from GitHub and the rest from npm: downloads, and versions' publish times
  as releases. No stars-over-time line and no contributors list.
- **Velocity is two charts.** Foldkit's chart puts commits and releases on
  two y-axes; they are two charts here.
- **Clicking a package in the graph selects it as a datum**, not as the
  chosen package: the package is the Controls Child's data, and the app
  cannot set it (roll-up 14).
- **Controls is a Child that reports up**, as Tools does in pixel-art: one
  choice is two Messages, and the app keeps a copy to draw with.
- GitHub answers 202 while it computes commit activity: then the weeks show
  zero commits with a warning to refresh.

## Blockers

- **A parent cannot send its Child a Message** (roll-up 14): picking a package
  in the graph cannot move the package picker.
- **A parent cannot read its Child** (by design, as in form): hence the
  copied choice.

## Testing

Foldkit's stories pick each radio group and check the Model and
`SyncChart` (`Command.expectHas`, `Command.resolve`), resolve
`FetchTelemetry` with a fixture, and click a datum. `telemetry.test.ts`
checks the transforms; `init.test.ts` the first Model. Scenes resolve the
`MountChart` Mount with `Mount.resolve`.

What Effect Oak would need:

- Named Commands (roll-up 4) for the fetch.
- Nothing for the chart: it has no Mount or sync Command. Drawing a View from
  a given Model (roll-up 5) would test it like a scene.
- `telemetry/weeks.ts` and the chart's series are plain functions and can be
  tested today; the Telemetry Capability can be stubbed in a Layer.
