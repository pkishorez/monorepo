import { Effect, Schema } from 'effect';

/*
 * The two Open-Meteo endpoints and the parts of their answers the app reads.
 * Plain `fetch`, aborted if the Command asking is interrupted.
 */

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

const Place = Schema.Struct({
  name: Schema.String,
  latitude: Schema.Number,
  longitude: Schema.Number,
  admin1: Schema.optional(Schema.String),
});
type Place = typeof Place.Type;

const Places = Schema.Struct({
  results: Schema.optional(Schema.Array(Place)),
});

const Current = Schema.Struct({
  current: Schema.Struct({
    temperature_2m: Schema.Number,
    relative_humidity_2m: Schema.Number,
    wind_speed_10m: Schema.Number,
    weather_code: Schema.Number,
  }),
});

const getJson = (url: string, params: Record<string, string>) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
        signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as unknown;
    },
    catch: () => 'Failed to fetch weather data',
  });

export const firstPlace = (zipCode: string): Effect.Effect<Place, string> =>
  getJson(GEOCODING_API, {
    name: zipCode,
    count: '1',
    language: 'en',
    format: 'json',
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Places)),
    Effect.mapError(() => 'Location not found'),
    Effect.flatMap(({ results }) =>
      results?.[0]
        ? Effect.succeed(results[0])
        : Effect.fail('Location not found'),
    ),
  );

export const currentWeather = (place: Place) =>
  getJson(WEATHER_API, {
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Current)),
    Effect.map(({ current }) => current),
    Effect.mapError(() => 'Failed to fetch weather data'),
  );
