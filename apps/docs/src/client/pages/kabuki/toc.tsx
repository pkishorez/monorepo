import { ChevronDownIcon } from '@kestack/web-platform/ui/components/lucide';
import { label } from '../../components/index.ts';
import type { Heading } from '../../docs/index.ts';

/*
 * "On this page": the page's headings, as links to them. Beside the page
 * from the `xl` width; above it, folded, below that.
 */

function Links({ headings }: { readonly headings: ReadonlyArray<Heading> }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {headings.map((heading) => (
        <li key={heading.id} className={heading.depth === 3 ? 'pl-3' : ''}>
          <a
            href={`#${heading.id}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {heading.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Toc({
  headings,
}: {
  readonly headings: ReadonlyArray<Heading>;
}) {
  return (
    <nav aria-label="On this page" className="space-y-3">
      <h2 className={label}>On this page</h2>
      <Links headings={headings} />
    </nav>
  );
}

export function FoldedToc({
  headings,
}: {
  readonly headings: ReadonlyArray<Heading>;
}) {
  return (
    <details className="group rounded-lg border border-border xl:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        On this page
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-3 py-3">
        <Links headings={headings} />
      </div>
    </details>
  );
}
