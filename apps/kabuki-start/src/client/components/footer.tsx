import { Start } from '@kestack/kabuki/start';
import { clock } from './clock.ts';
import { column } from './styles.ts';

/*
 * When the server drew this page, and by which build; and whether the
 * Runtime has started in the browser, ticking once a second once it has.
 */

export function Footer({ live }: { readonly live: number | null }) {
  const drawn = Start.useDrawn();
  return (
    <footer className="border-t border-border">
      <div
        className={`${column} flex flex-col gap-2 py-6 font-mono text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${drawn ? 'bg-foreground/60' : 'bg-muted-foreground/40'}`}
          />
          <span data-testid="document">
            {drawn
              ? `Page drawn by the server at ${clock(drawn.at)}, build ${drawn.build?.slice(0, 8) ?? 'dev'}`
              : 'Not served by Start'}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${live === null ? 'bg-muted-foreground/40' : 'animate-pulse bg-positive'}`}
          />
          <span data-testid="runtime" data-live={live !== null}>
            {live === null
              ? 'Runtime not started'
              : `Runtime live, ${clock(live)}`}
          </span>
        </p>
      </div>
    </footer>
  );
}
