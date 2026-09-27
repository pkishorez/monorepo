import { useEffect, useState } from 'react';

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const ago = (then: Date, now: Date): string => {
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit);
    }
  }
  return 'just now';
};

/**
 * A build time as "Sep 27, 2026, 9:41 PM · 3 hours ago" in the viewer's
 * locale and time zone. Those differ from the server's, so the ISO string
 * renders first and the friendly text replaces it after mount.
 */
export function BuiltAt(props: {
  readonly iso: string | null;
  readonly testId?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (props.iso === null)
    return <span data-testid={props.testId}>unknown</span>;
  const then = new Date(props.iso);
  return (
    <time data-testid={props.testId} dateTime={props.iso} title={props.iso}>
      {now === null ? (
        props.iso
      ) : (
        <>
          {then.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          <span className="text-muted-foreground"> · {ago(then, now)}</span>
        </>
      )}
    </time>
  );
}
