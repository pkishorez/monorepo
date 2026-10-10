import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Forecast, WeatherData } from './forecast/index.js';

/*
 * Weather for a zip code: Idle → Loading → Loaded or Failed.
 *
 * The zip code is typed into the Model, so it stays through every State.
 * Submitting moves to Loading, whose Command asks the Forecast Capability and
 * answers with the weather or the reason it failed. A submit while Loading has
 * no rule, so it is ignored: Foldkit's "if pending, do nothing" is a State.
 */

const fetchWeather = (zipCode: string) =>
  Effect.gen(function* () {
    const weather = yield* (yield* Forecast).lookup(zipCode);
    return { _tag: 'SucceededFetchWeather' as const, weather };
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({ _tag: 'FailedFetchWeather' as const, error }),
    ),
  );

const submitted = (
  _: unknown,
  { model }: { readonly model: { readonly zipCode: string } },
) => ({
  state: { _tag: 'Loading' as const, zipCode: model.zipCode },
  command: fetchWeather(model.zipCode),
});

export const Weather = Actor.make('Weather', {
  requires: { forecast: Forecast },
  model: Schema.Struct({ zipCode: Schema.String }),
  state: Schema.TaggedUnion({
    Idle: {},
    Loading: { zipCode: Schema.String },
    Loaded: { weather: WeatherData },
    Failed: { error: Schema.String },
  }),
  message: Schema.TaggedUnion({
    UpdatedZipCode: { value: Schema.String },
    SubmittedWeatherForm: {},
    SucceededFetchWeather: { weather: WeatherData },
    FailedFetchWeather: { error: Schema.String },
  }),
}).build({
  init: () => ({ model: { zipCode: '' }, state: { _tag: 'Idle' } }),
  update: {
    Idle: { SubmittedWeatherForm: submitted },
    Loaded: { SubmittedWeatherForm: submitted },
    Failed: { SubmittedWeatherForm: submitted },
    Loading: {
      SucceededFetchWeather: ({ weather }) => ({
        state: { _tag: 'Loaded', weather },
      }),
      FailedFetchWeather: ({ error }) => ({
        state: { _tag: 'Failed', error },
      }),
    },
    '*': {
      UpdatedZipCode: ({ value }) => ({ model: { zipCode: value } }),
    },
  },
});

export { OpenMeteoLive } from './forecast/index.js';
