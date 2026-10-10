# Rockets

Status: works

## What it is

Not a Foldkit port: Effect Oak's own walkthrough, the app the Walkthrough
video records. Seven chapters, each its own app with its own Log and
devtools, each adding one idea to the one before. Pick a chapter and a Look
on the page, or in the URL: `?chapter=1..7&look=plain|colorful|exotic`.
`&chrome=0` drops the header, leaving the app and the docked devtools, for
recording.

```
actor/         1 An Actor     Rocket, no States; Model { fuel }; Fuel, Drain
states/        2 States       Rocket: OnPad | InFlight | Landed | Lost
                              InFlight's Lifetime sends Burned every 400 ms; empty → Lost
more-actors/   3 More Actors  LaunchSite { rockets, next }, Built; rockets: Actor.many(Rocket)
                              Booster: Firing → Spent (Lifetime sends Separated after 1.5 s)
                              Rocket InFlight Invokes boosters: Actor.many(Booster), keys left, right
capabilities/  4 Capabilities LaunchSite { weather }, ToggledStorm; Provides Weather (Layer from self)
                              Rocket Requires Weather; Launch → Command → Cleared | Scrubbed
motion/        5 Motion       the View only: layoutId glide, AnimatePresence, boosters falling
               6 Time Travel  chapter 5's code, as its own app
commands/      7 Commands     Launch → Countdown { count }, a Command keyed 'countdown'
                              Launch again restarts it; Abort cancels it → OnPad
look/          the three Looks: the parts every View draws with
chapters.ts    the seven apps (toReact), in order
rockets.tsx    the page: Look, chapter, Shell
```

Each chapter folder holds its Actors, one per file, and a `view.tsx`. The
Actor files never import a View or a Look, so the code a chapter shows is the
whole Actor. A chapter reuses the previous one's Actors where nothing
changed: Capabilities uses More Actors' Booster, Motion and Time Travel run
Capabilities' Actors.

## Looks

Views are written once per chapter, against the parts in `look/` (`Stage`,
`Toolbar`, `Berths`, `Berth`, `Bay`, `Ship`, `Pod`, `Gauge`, `Button`). Each
Look draws those parts its own way:

- **plain**: black ink on white paper, the system font, hairline boxes; no shadows, no gradients.
- **colorful**: flat colour blocks with thick ink outlines, rounded heavy type, one sky colour per berth; no blur, glow, shadow or gradient.
- **exotic**: a night sky with stars that shift with the pointer, frosted bays, metal rockets with a flickering exhaust plume, rain and lightning in a storm.

Switching the Look redraws the same running app, so the Log survives it. Each
Look also sets the Motion transition (a calm tween, a light spring, a springy
spring). `MotionConfig reducedMotion="user"` and a `prefers-reduced-motion`
block stop the glide, the flicker, the rain and the parallax.

## Motion and Time Travel

Each State is drawn by its own component, so a Transition unmounts the pad
drawing and mounts the sky one. The rocket keeps `layoutId={id}` (its
Instance ID) in both, so Motion glides it between them. Time Travel draws the
same Views from the Step's Snapshot, so stepping back from InFlight to OnPad
glides the rocket down again. A spent booster falls away as it mounts.

## Deviations from the spec

- Chapter 7's countdown `count` is State data (`Countdown { count }`), not
  Model: it only exists while counting down.
- Boosters are `Actor.many(Booster)` keyed `left` and `right`, not two fixed
  Children, so the Inspector draws them as one Booster stack with its count.
- Booster separation is drawn when `Spent` mounts, not with `AnimatePresence`:
  a Booster's States are drawn by components `View.make` keys itself, so
  there is no place to wrap them. `AnimatePresence` animates rockets
  appearing (and leaving, when Time Travel steps back past a Built).
- In the devtools, ArrowDown steps back and ArrowUp steps forward (the
  Timeline is drawn newest first).

## Blockers

None.
