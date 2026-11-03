import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import { router } from '../../shared/index.ts';
import type {
  KabukiSlug,
  Package,
  Route,
  StdToolkitSlug,
} from '../../shared/index.ts';

/*
 * Where each package's place is: its landing page, and each of its docs
 * pages by slug. The one place that knows which Route a package is.
 */

export const packageRoute = (id: Package['id']): Route => {
  switch (id) {
    case 'kabuki':
      return router.Kabuki();
    case 'std-toolkit':
      return router.StdToolkit();
  }
};

/** A package's docs page, by a slug its table of contents holds. */
export const docRoute = (id: Package['id'], slug: string): Route => {
  switch (id) {
    case 'kabuki':
      return router.Kabuki.Doc({ slug: slug as KabukiSlug });
    case 'std-toolkit':
      return router.StdToolkit.Doc({ slug: slug as StdToolkitSlug });
  }
};

/** Whether the current Route is in this package's place. */
export const inPackage = (route: Route, id: Package['id']): boolean =>
  route._tag === packageRoute(id)._tag;

/** The package whose place the current Route is in, if any. */
export const packageAt = (route: Route): Package['id'] | undefined =>
  route._tag === 'Kabuki'
    ? 'kabuki'
    : route._tag === 'StdToolkit'
      ? 'std-toolkit'
      : undefined;

/** The slug of the docs page the current Route shows, if it shows one. */
export const slugAt = (route: Route): string | undefined =>
  (route._tag === 'Kabuki' || route._tag === 'StdToolkit') &&
  route.page?._tag === 'Doc'
    ? route.page.slug
    : undefined;

/** A link to a package's landing page. */
export function PackageLink({
  id,
  current,
  className,
  children,
}: {
  readonly id: Package['id'];
  readonly current?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <Router.Link
      to={packageRoute(id)}
      aria-current={current ? 'page' : undefined}
      className={className}
    >
      {children}
    </Router.Link>
  );
}
