import type { OtelEvent } from '../trace-model';

export type LogSeverity = 'trace' | 'debug' | 'info' | 'warn' | 'error' | null;

const SEVERITY_KEYS = [
  'severity',
  'level',
  'log.severity',
  'log.level',
  'severityText',
  'log.severityText',
];

function severityFromNumber(value: number): LogSeverity {
  if (value <= 0) return null;
  if (value <= 4) return 'trace';
  if (value <= 8) return 'debug';
  if (value <= 12) return 'info';
  if (value <= 16) return 'warn';
  return 'error';
}

export function detectLogSeverity(event: OtelEvent): LogSeverity {
  if (event.name === 'exception') return 'error';
  for (const key of SEVERITY_KEYS) {
    const raw = event.attributes[key];
    if (typeof raw !== 'string') continue;
    const normalized = raw.toLowerCase().trim();
    if (normalized === 'trace') return 'trace';
    if (normalized === 'debug') return 'debug';
    if (normalized === 'info') return 'info';
    if (normalized === 'warn' || normalized === 'warning') return 'warn';
    if (
      normalized === 'error' ||
      normalized === 'fatal' ||
      normalized === 'critical'
    ) {
      return 'error';
    }
  }
  const number =
    event.attributes['severityNumber'] ??
    event.attributes['log.severityNumber'];
  return typeof number === 'number' ? severityFromNumber(number) : null;
}

export const LOG_SEVERITY_DOT_CLASS: Record<
  NonNullable<LogSeverity>,
  string
> = {
  trace: 'bg-slate-300',
  debug: 'bg-violet-400',
  info: 'bg-sky-400',
  warn: 'bg-amber-400',
  error: 'bg-destructive',
};

export const LOG_SEVERITY_LABEL_CLASS: Record<
  NonNullable<LogSeverity>,
  string
> = {
  trace: 'text-muted-foreground',
  debug: 'text-muted-foreground',
  info: 'text-sky-600 dark:text-sky-400',
  warn: 'text-amber-700 dark:text-amber-400',
  error: 'text-destructive',
};

export function logDotColorClass(event: OtelEvent): string {
  const severity = detectLogSeverity(event);
  return severity ? LOG_SEVERITY_DOT_CLASS[severity] : 'bg-white/90';
}
