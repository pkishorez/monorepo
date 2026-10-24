import {
  CheckIcon,
  RotateCcwIcon,
} from '@kestack/web-platform/components/lucide';
import { Button } from '@kestack/web-platform/components/button';
import { CATALOG, GESTURES } from '../../shared/gestures/index.ts';
import type { Entry, Gesture, HandId } from '../../shared/gestures/index.ts';
import { HAND_COLOR } from '../stage/index.ts';

/*
 * Every gesture, grouped, each ticked once it has fired and flashing each
 * time it fires again; below, the last few gestures seen. Count is ticked
 * only once every number, 0 to 5, has been seen.
 */

const DIGITS = [0, 1, 2, 3, 4, 5];

const done = (
  gesture: Gesture,
  counts: Readonly<Record<Gesture, number>>,
  digits: ReadonlyArray<number>,
) =>
  gesture === 'Count' ? digits.length === DIGITS.length : counts[gesture] > 0;

const NAMES = Object.fromEntries(
  CATALOG.flatMap((group) => group.entries).map((entry) => [
    entry.gesture,
    entry.name,
  ]),
) as Record<Gesture, string>;

function Row({
  entry,
  count,
  ticked,
  digits,
}: {
  readonly entry: Entry;
  readonly count: number;
  readonly ticked: boolean;
  readonly digits: ReadonlyArray<number>;
}) {
  return (
    <li className="relative flex items-start gap-3 overflow-hidden rounded-lg px-2 py-2">
      {/* Remounted on every new count, so it flashes each time the gesture fires. */}
      {count > 0 && (
        <span
          key={count}
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-[fired_900ms_ease-out_forwards] bg-foreground/10"
        />
      )}
      <span
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${ticked ? 'border-transparent bg-foreground text-background' : 'border-border'}`}
      >
        {ticked && <CheckIcon className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2 text-sm font-medium">
          {entry.name}
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {count > 0 ? `×${count}` : ''}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {entry.how} → {entry.does}
        </p>
        {entry.gesture === 'Count' && (
          <ul className="mt-1.5 flex gap-1">
            {DIGITS.map((digit) => (
              <li
                key={digit}
                className={`grid size-6 place-items-center rounded-md font-mono text-xs ${digits.includes(digit) ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
              >
                {digit}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function Checklist({
  counts,
  digits,
  reset,
}: {
  readonly counts: Readonly<Record<Gesture, number>>;
  readonly digits: ReadonlyArray<number>;
  readonly reset: () => void;
}) {
  const tried = GESTURES.filter((gesture) =>
    done(gesture, counts, digits),
  ).length;
  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Gestures</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {tried} of {GESTURES.length} seen
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={tried === 0}
        >
          <RotateCcwIcon /> Reset
        </Button>
      </header>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-foreground transition-[width] duration-300"
          style={{ width: `${(tried / GESTURES.length) * 100}%` }}
        />
      </div>
      {CATALOG.map((group) => (
        <div key={group.name} className="space-y-1">
          <h3 className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.name}
          </h3>
          <ul>
            {group.entries.map((entry) => (
              <Row
                key={entry.gesture}
                entry={entry}
                count={counts[entry.gesture]}
                ticked={done(entry.gesture, counts, digits)}
                digits={digits}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function Log({
  log,
}: {
  readonly log: ReadonlyArray<{
    readonly n: number;
    readonly gesture: Gesture;
    readonly hand: HandId | null;
    readonly detail: string;
  }>;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Just seen</h2>
      {log.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="space-y-1">
          {log.map(({ n, gesture, hand, detail }) => (
            <li key={n} className="flex items-center gap-2 text-sm">
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-black"
                style={{ background: hand ? HAND_COLOR[hand] : 'var(--muted)' }}
              >
                {hand ?? '2'}
              </span>
              <span className="font-medium">{NAMES[gesture]}</span>
              {detail && (
                <span className="text-muted-foreground">{detail}</span>
              )}
              <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                #{n}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
