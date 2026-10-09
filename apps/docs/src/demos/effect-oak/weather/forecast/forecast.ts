import { Context, Effect, Layer, Schema } from 'effect';
import { describe } from './conditions.js';
import { currentWeather, firstPlace } from './open-meteo.js';

/*
 * Where the weather comes from: one Service with one lookup, and its Layer
 * over Open-Meteo, a public API that needs no key. A lookup fails with the
 * sentence the app shows.
 */

export const WeatherData = Schema.Struct({
  zipCode: Schema.String,
  temperature: Schema.Number,
  description: Schema.String,
  humidity: Schema.Number,
  windSpeed: Schema.Number,
  locationName: Schema.String,
  region: Schema.String,
});
export type WeatherData = typeof WeatherData.Type;

export class Forecast extends Context.Service<
  Forecast,
  { readonly lookup: (zipCode: string) => Effect.Effect<WeatherData, string> }
>()('docs/weather/Forecast') {}

/** Find the place, then its current weather: two requests to Open-Meteo. */
const lookup = (zipCode: string): Effect.Effect<WeatherData, string> =>
  Effect.gen(function* () {
    if (zipCode.trim() === '') return yield* Effect.fail('Zip code required');
    const place = yield* firstPlace(zipCode);
    const now = yield* currentWeather(place);
    return {
      zipCode,
      temperature: Math.round(now.temperature_2m),
      description: describe(now.weather_code),
      humidity: now.relative_humidity_2m,
      windSpeed: Math.round(now.wind_speed_10m),
      locationName: place.name,
      region: place.admin1 ?? '',
    };
  });

export const OpenMeteoLive = Layer.succeed(Forecast, { lookup });
