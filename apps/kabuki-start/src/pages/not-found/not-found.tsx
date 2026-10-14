import { Router } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';
import { Page } from '../../parts/index.ts';
import { Routes } from '../../routes.ts';

/** A URL that names no place, or a place whose Loader found nothing: a 404. */
export const NotFound = ({ path }: { readonly path: string }) => (
  <Page place="NotFound" title="Nothing here" intro={`No page at ${path}.`}>
    <Router.Link
      to={Routes.Home()}
      className={buttonVariants({ variant: 'outline' })}
    >
      Back home
    </Router.Link>
  </Page>
);
