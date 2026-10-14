import type { ReactNode } from 'react';
import type { Place } from '../../shared/index.ts';
import { Provenance } from './provenance.tsx';

/*
 * The frame every page is drawn in: its title, what it is, the Provenance
 * box that says how it came to be, and its content.
 */

/** One place on screen: its title, what it is, how it came to be, and its content. */
export function PageFrame({
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
