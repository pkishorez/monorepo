import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import { router } from '../../shared/index.ts';
import type { Route, Toolkit } from '../../shared/index.ts';

/*
 * Where each toolkit's place is: its landing page.
 */

export const toolkitRoute = (id: Toolkit['id']): Route => {
  switch (id) {
    case 'kabuki':
      return router.Kabuki();
  }
};

/** Whether the current Route is in this toolkit's place. */
export const inToolkit = (route: Route, id: Toolkit['id']): boolean =>
  route._tag === toolkitRoute(id)._tag;

/** A link to a toolkit's landing page. */
export function ToolkitLink({
  id,
  current,
  className,
  children,
}: {
  readonly id: Toolkit['id'];
  readonly current?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <Router.Link
      to={toolkitRoute(id)}
      aria-current={current ? 'page' : undefined}
      className={className}
    >
      {children}
    </Router.Link>
  );
}
