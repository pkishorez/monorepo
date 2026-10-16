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
      <p
        className={`${column} py-4 font-mono text-[11px] text-muted-foreground`}
      >
        {drawn
          ? `Drawn by the server at ${clock(drawn.at)}, build ${drawn.build?.slice(0, 8) ?? 'dev'}`
          : 'Not served by Start'}
        {' · '}
        {live === null ? 'Runtime not started' : `Runtime live, ${clock(live)}`}
      </p>
    </footer>
  );
}
