import { Router } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';
import { Routes } from '../../../shared/index.ts';

/** A URL that names no page: the root page draws this, and the server answers 404. */
export function NotFound({ path }: { readonly path: string }) {
  return (
    <section data-testid="not-found" className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-muted-foreground">
        No page at <code className="font-mono">{path}</code>.
      </p>
      <Router.Link
        to={Routes.Home()}
        className={buttonVariants({ variant: 'outline' })}
      >
        Back home
      </Router.Link>
    </section>
  );
}
