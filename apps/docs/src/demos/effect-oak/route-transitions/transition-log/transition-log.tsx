import { Schema } from 'effect';
import { Badge } from '@kstackz/web-platform/components/badge';

/*
 * The log of every route change, newest first, kept in the root's Model.
 * Foldkit's `Transition` helpers (entered, exited, stayed, cold load) become
 * plain comparisons of the State before and after, which the root's Update
 * has anyway: it is handed the old State and returns the new one.
 */

const Side = Schema.Struct({ tag: Schema.String, label: Schema.String });
type Side = typeof Side.Type;

export const LogEntry = Schema.Struct({
  n: Schema.Number,
  /** null on the cold load: there was no page before. */
  from: Schema.NullOr(Side),
  to: Side,
});
type LogEntry = typeof LogEntry.Type;

const KEEP = 20;

/** The log with one more entry on top. */
export const record = (
  log: ReadonlyArray<LogEntry>,
  from: Side | null,
  to: Side,
): ReadonlyArray<LogEntry> =>
  [{ n: (log[0]?.n ?? 0) + 1, from, to }, ...log].slice(0, KEEP);

const badgesOf = ({ from, to }: LogEntry) => {
  if (from === null) return ['Cold load', `Entered ${to.tag}`];
  if (from.tag === to.tag) return [`Stayed ${to.tag}`];
  return [`Exited ${from.tag}`, `Entered ${to.tag}`];
};

export const TransitionLog = ({
  log,
}: {
  readonly log: ReadonlyArray<LogEntry>;
}) => (
  <aside className="flex flex-col gap-3">
    <h2 className="text-sm font-semibold">Transition log</h2>
    {log.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nothing yet.</p>
    ) : (
      <ol className="flex flex-col gap-2">
        {log.map((entry) => (
          <li key={entry.n} className="rounded-md border p-2 text-sm">
            <p className="text-muted-foreground">
              #{entry.n} {entry.from?.label ?? '(none)'} → {entry.to.label}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {badgesOf(entry).map((badge) => (
                <Badge key={badge} variant="secondary">
                  {badge}
                </Badge>
              ))}
            </div>
          </li>
        ))}
      </ol>
    )}
  </aside>
);
