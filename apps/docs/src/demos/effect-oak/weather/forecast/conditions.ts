/** WMO weather codes, as Open-Meteo reports them, in words. */
const CONDITIONS: ReadonlyArray<readonly [ReadonlyArray<number>, string]> = [
  [[0], 'Clear sky'],
  [[1, 2, 3], 'Partly cloudy'],
  [[45, 48], 'Foggy'],
  [[51, 53, 55], 'Drizzle'],
  [[61, 63, 65], 'Rain'],
  [[66, 67], 'Freezing rain'],
  [[71, 73, 75, 77], 'Snow'],
  [[80, 81, 82], 'Rain showers'],
  [[85, 86], 'Snow showers'],
  [[95, 96, 99], 'Thunderstorm'],
];

export const describe = (code: number) =>
  CONDITIONS.find(([codes]) => codes.includes(code))?.[1] ?? 'Unknown';
