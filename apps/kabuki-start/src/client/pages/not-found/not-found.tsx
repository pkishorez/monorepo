import { Router } from '@kestack/kabuki/routing';
import { router } from '../../../shared/index.ts';
import { link } from '../../components/index.ts';

/** A URL that names no page: the root page draws this, and the server answers 404. */
export function NotFound({ path }: { readonly path: string }) {
  return (
    <section className="space-y-2 rounded-lg border border-dashed border-border p-6">
      <h1 className="text-xl font-semibold">Nothing here</h1>
      <p className="text-sm text-muted-foreground">
        No page at <code className="font-mono text-foreground">{path}</code>:
        the root page draws this, and the server answered 404.{' '}
        <Router.Link to={router.Home()} className={link}>
          Home
        </Router.Link>
      </p>
    </section>
  );
}
