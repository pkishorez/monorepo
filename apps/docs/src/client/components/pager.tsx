import { Router } from '@kestack/kabuki/routing';
import { packageOf } from '../../shared/index.ts';
import type { Package } from '../../shared/index.ts';
import { docRoute } from './package-link.tsx';

/** The pages before and after this one, in its package's reading order. */
export function Pager({
  id,
  slug,
}: {
  readonly id: Package['id'];
  readonly slug: string;
}) {
  const { docs } = packageOf(id).contents;
  const at = docs.findIndex((doc) => doc.slug === slug);
  const before = docs[at - 1];
  const after = docs[at + 1];
  return (
    <nav
      aria-label="More docs"
      className="grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
    >
      {before ? (
        <Router.Link
          to={docRoute(id, before.slug)}
          className="rounded-lg border border-border p-4 hover:bg-muted/40"
        >
          <span className="block text-xs text-muted-foreground">Previous</span>
          <span className="text-sm font-medium">{before.title}</span>
        </Router.Link>
      ) : (
        <span />
      )}
      {after && (
        <Router.Link
          to={docRoute(id, after.slug)}
          className="rounded-lg border border-border p-4 text-right hover:bg-muted/40"
        >
          <span className="block text-xs text-muted-foreground">Next</span>
          <span className="text-sm font-medium">{after.title}</span>
        </Router.Link>
      )}
    </nav>
  );
}
