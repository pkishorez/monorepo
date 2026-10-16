import { Router } from '@kestack/kabuki/routing';
import { DOCS, router } from '../../../shared/index.ts';
import type { Slug } from '../../../shared/index.ts';

/** The pages before and after this one, in reading order. */
export function Pager({ slug }: { readonly slug: Slug }) {
  const at = DOCS.findIndex((doc) => doc.slug === slug);
  const before = DOCS[at - 1];
  const after = DOCS[at + 1];
  return (
    <nav
      aria-label="More docs"
      className="grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
    >
      {before ? (
        <Router.Link
          to={router.Kabuki.Doc({ slug: before.slug as Slug })}
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
          to={router.Kabuki.Doc({ slug: after.slug as Slug })}
          className="rounded-lg border border-border p-4 text-right hover:bg-muted/40"
        >
          <span className="block text-xs text-muted-foreground">Next</span>
          <span className="text-sm font-medium">{after.title}</span>
        </Router.Link>
      )}
    </nav>
  );
}
