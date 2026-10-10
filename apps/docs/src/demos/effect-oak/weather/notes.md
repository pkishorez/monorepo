# Weather

Status: works

## What was ported

Foldkit's `weather`: type a zip code, submit, and see the current weather from
Open-Meteo, or why it failed.

```
Weather (root)                     requires Forecast (from the Layer); Model { zipCode }
  Idle
  Loading { zipCode }              Command: Forecast.lookup → SucceededFetchWeather | FailedFetchWeather
  Loaded { weather }
  Failed { error }
forecast/  Forecast Capability and OpenMeteoLive: plain fetch + Schema decode
report/    Report, a drawing of one place's weather; not an Actor
```

Foldkit's `AsyncData` (Idle, Loading, Success, Failure) became the Actor's
States. A submit while Loading has no rule in that State, so it is ignored,
where Foldkit checks `isPending` in Update.

## Deviations

- **Network: the real Open-Meteo API**, as Foldkit uses. It needs no key.
  `effect/http`'s HttpClient is replaced by `fetch` inside a `Forecast`
  Capability, aborted if the Command is interrupted. The Capability fails with the
  sentence the app shows.
- One Actor. The zip code field lives in the root's Model because it must
  survive every Transition; a `Search` Child would not (see Blockers).
- web-platform Input, Button, Card, Alert and Spinner instead of `@foldkit/ui`.

## Blockers

- **A Child cannot live across several States.** Children belong to one
  State, so a Search Child placed in all four States would be created anew on
  every Transition, and the typed zip code would be lost on submit. An API
  could be Children declared for every State
  (`children: { '*': { search: Search } }`), kept through Transitions between
  States that all list them.
- **Each State is drawn by its own keyed component**, so the form is
  remounted on every Transition: after submitting, the input has lost focus.
  Small here, but it is what made the [form](../form/notes.md) keep its field
  status out of States.

## Testing

Foldkit's `story.test.ts` sends `SubmittedWeatherForm`, checks the Model went
to Loading, then answers the Command by hand with
`Command.resolve(FetchWeather, SucceededFetchWeather({ weather }))` and checks
Success, and the same for Failure. A second test runs `fetchWeatherEffect`
against a fake `HttpClient` Layer that serves fixture JSON per URL.
`scene.test.ts` types into the field, clicks the button and resolves the
Command, then queries the rendered card.

What Effect Oak would need:

- **Named Commands** to check that submitting asked for `FetchWeather` with
  this zip code and to answer it with a chosen Message (roll-up blocker 4).
- A typed `Actor.step` and a way to draw a View from a given State (blocker 5).
- The Capability test works today: `lookup` can run against a stub `fetch`, or
  the whole app with `Runtime.start` and a fake `Forecast` Layer.
