import type { ReactNode } from 'react';
import type { Place } from '../routes.ts';
import { Provenance } from './provenance.tsx';
import { clock } from './time.ts';

/*
 * What every page is drawn with: its frame, the badge that says how it came
 * to be, and the few classes the pages share.
 */

/** A link in running text. */
export const link =
  'font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground';

/** A Card that is a link as a whole: it lifts its ring on hover. */
export const tile =
  'block h-full rounded-xl transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 [&>[data-slot=card]]:h-full [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:transition-shadow hover:[&>[data-slot=card]]:ring-foreground/20';

/** One place on screen: its title, what it is, how it came to be, and its content. */
export function Page({
  place,
  loadedAt,
  title,
  intro,
  children,
}: {
  /** The place drawn, or the not-found Route, which is no place. */
  readonly place: Place | 'NotFound';
  /** When its Input was loaded; none for a place with no Input. */
  readonly loadedAt?: number;
  readonly title: string;
  readonly intro?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section data-testid={`place:${place}`} className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {intro && (
          <p className="max-w-prose text-pretty text-muted-foreground">
            {intro}
          </p>
        )}
      </header>
      <Provenance place={place} loadedAt={loadedAt} />
      {children}
    </section>
  );
}

export { Provenance, clock };
