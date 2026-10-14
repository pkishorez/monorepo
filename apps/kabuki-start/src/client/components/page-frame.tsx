import type { ReactNode } from 'react';
import type { Place } from '../../shared/index.ts';
import { Provenance } from './provenance.tsx';

/*
 * The frame every page is drawn in: its title, what it shows, the
 * Provenance box that says how it came to be, and its content.
 */

export function PageFrame({
  place,
  data,
  title,
  intro,
  aside,
  children,
}: {
  readonly place: Place;
  /** When its Loader started and answered; none for a page with no data. */
  readonly data?: { readonly startedAt: number; readonly loadedAt: number };
  readonly title: ReactNode;
  readonly intro?: ReactNode;
  /** Beside the title: a mark while it loads again, a button. */
  readonly aside?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section data-testid={`place:${place}`} className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          {aside}
        </div>
        {intro && (
          <p className="max-w-prose text-pretty text-muted-foreground">
            {intro}
          </p>
        )}
      </header>
      <Provenance place={place} {...(data ? { data } : {})} />
      {children}
    </section>
  );
}
