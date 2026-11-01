import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import { router } from '../../shared/index.ts';
import type { Route, Package } from '../../shared/index.ts';

/*
 * Where each package's place is: its landing page.
 */

export const packageRoute = (id: Package['id']): Route => {
  switch (id) {
    case 'kabuki':
      return router.Kabuki();
  }
};

/** Whether the current Route is in this package's place. */
export const inPackage = (route: Route, id: Package['id']): boolean =>
  route._tag === packageRoute(id)._tag;

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
