import type { ReactNode } from 'react';

/*
 * How every page opens: its name, and one sentence on what it shows.
 */

export function PageIntro({
  title,
  children,
}: {
  readonly title: string;
  /** The one sentence: what the page shows, and what to do. */
  readonly children: ReactNode;
}) {
  return (
    <header className="mb-10 max-w-[60ch] space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      <p className="text-base text-pretty text-muted-foreground">{children}</p>
    </header>
  );
}
