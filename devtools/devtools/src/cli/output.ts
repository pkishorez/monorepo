import { Console } from 'effect';
import { Flag } from 'effect/unstable/cli';

export type OutputFormat = 'json' | 'text';

export const formatFlag = Flag.choice('format', ['json', 'text']).pipe(
  Flag.withDescription('Output as machine-readable JSON or readable text'),
  Flag.withDefault('json' as OutputFormat),
);

/** Prints `value` as pretty JSON or through `renderText`, by format. */
export const print = <A>(
  format: OutputFormat,
  value: A,
  renderText: (value: A) => string,
) =>
  Console.log(
    format === 'json' ? JSON.stringify(value, null, 2) : renderText(value),
  );

const NANOS_PER_MILLI = 1_000_000n;

/** Converts an OTLP unix-nano time to epoch milliseconds, or null. */
export const nanosToMillis = (
  value: string | number | null | undefined,
): number | null => {
  if (value === undefined || value === null) return null;
  try {
    const nanos = BigInt(value);
    return (
      Number(nanos / NANOS_PER_MILLI) + Number(nanos % NANOS_PER_MILLI) / 1e6
    );
  } catch {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed / 1e6 : null;
  }
};

export const isoTime = (millis: number | null) =>
  millis === null ? null : new Date(Math.floor(millis)).toISOString();

export const formatMillis = (millis: number | null) =>
  millis === null ? '…' : `${millis.toFixed(1)}ms`;

/** Renders an offset from a start time as a fixed-width `+12.3ms` column. */
export const offsetColumn = (millis: number | null, start: number | null) =>
  (millis === null || start === null
    ? '+?'
    : `+${(millis - start).toFixed(1)}ms`
  ).padEnd(11);

export const formatAttributes = (attributes: Record<string, unknown>) => {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return '';
  return entries
    .map(
      ([key, value]) =>
        `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
    )
    .join(' ');
};
