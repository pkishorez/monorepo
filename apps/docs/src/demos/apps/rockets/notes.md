# Rockets

Status: works

## What it is

Effect Oak's own tutorial app, the one the Walkthrough builds up and
records. Four apps, each with its own Log, picked with
`?app=actor|state|fleet|capabilities`:

```
actor/         An Actor     Rocket { fuel }; Fuel. Click the rocket to fuel it.
state/         States       Rocket: OnPad → Ascending → Separating → Cruising
                            → Descending { safe } → Landed → Returning → OnPad,
                            or Crashed (landed with under 30 fuel) or Lost (ran dry).
                            Each moving State's Worker sends the Message that
                            ends it; Cruising burns 5 fuel every 0.7 s, and a
                            rocket docks back on its pad with an empty tank.
fleet/         Children     Fleet { rockets, next }; Build, Dismantle; Actor.many(Rocket)
capabilities/  Capabilities The Fleet Provides Weather and Hangar; each Rocket
                            Requires both. Launch is a Command that checks the sky;
                            Dismantle is a Command that asks the Hangar.
draw/          The drawing every View shares: the rocket, the site, the flight.
apps.ts        the four apps (toReact)
sources.ts     the Actors' code as text, for the Walkthrough
```

## Drawing

One plain look: the theme's ink on its paper, fuel as the one colour.

- `Site` lays the pads out: launch pads on the left, landing pads on the
  right, five rockets to a row, at most twenty, and zooms to fit, so each
  new rocket zooms the site out a little.
- `Flight` draws one rocket and its pads. Every State of the Rocket is drawn
  by the same function; the rocket's position lives in motion values kept
  per Instance, and every State animates on from where the last one left it. Drawn on its own, a rocket brings its own site and a
  strip of its States.
- Storms rain from the top right; a scrubbed launch shakes the rocket.

## Deviations from the spec

- A Rocket in the Fleet learns its name as Input, so it can ask the Hangar to
  dismantle it by name.

## Blockers

None.
