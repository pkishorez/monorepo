import { Router } from '@kestack/kabuki/routing';
import { router } from '../../../shared/index.ts';
import { column, link } from '../../components/index.ts';

/** A URL that names no page: the root page draws this, and the server answers 404. */
export function NotFound({ path }: { readonly path: string }) {
  return (
    <main className={`${column} py-24`}>
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        No page at <code className="font-mono text-foreground">{path}</code>.{' '}
        <Router.Link to={router.Home()} className={link}>
          Go home
        </Router.Link>
      </p>
    </main>
  );
}
