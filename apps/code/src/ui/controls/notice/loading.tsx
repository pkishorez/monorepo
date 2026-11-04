import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { ReactNode } from 'react';

/*
 * What a page says while it has nothing to draw yet: a small spinner and
 * what it loads, in the page's quiet words. It shows only once the wait is
 * long enough to see (`animate-arrive`, as the sign-in screen's), so a
 * quick read shows nothing. One line, where the page's first words will
 * be, so what comes in its place moves nothing around it.
 */

/** Says the page is loading `children`, once the wait is long enough to see. */
export function Loading({ children }: { readonly children: ReactNode }) {
  return (
    <p
      role="status"
      data-slot="loading"
      className="flex animate-arrive items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner aria-hidden className="shrink-0" />
      {children}
    </p>
  );
}
