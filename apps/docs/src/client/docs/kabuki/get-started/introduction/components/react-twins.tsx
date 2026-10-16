import { Router } from '@kestack/kabuki/routing';
import { ArrowRightIcon } from '@kestack/web-platform/components/lucide';
import { docOf, numberOf, router } from '../../../../../../shared/index.ts';
import type { Slug } from '../../../../../../shared/index.ts';

/*
 * Each React idea beside its kabuki twin, one row per primitive, in the
 * order the docs tell them. Each row is the way to its page.
 */

const TWINS: ReadonlyArray<{ readonly react: string; readonly slug: Slug }> = [
  { react: 'A component', slug: 'actor' },
  { react: 'Conditional rendering', slug: 'state-machine' },
  { react: 'useEffect', slug: 'workers' },
  { react: 'Child components', slug: 'children' },
  { react: 'Props', slug: 'props' },
  { react: 'Context', slug: 'capabilities' },
  { react: 'JSX', slug: 'view' },
  { react: 'Nothing quite like it', slug: 'history' },
];

export function ReactTwins() {
  return (
    <div className="my-8 overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-2 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>In React</span>
        <span>In kabuki</span>
      </div>
      <ol className="divide-y divide-border">
        {TWINS.map(({ react, slug }) => (
          <li key={slug}>
            <Router.Link
              to={router.Kabuki.Doc({ slug })}
              className="group grid min-h-11 grid-cols-2 items-center px-4 text-sm hover:bg-muted/40"
            >
              <span
                className={
                  react === 'useEffect' || react === 'JSX'
                    ? 'font-mono text-[13px] text-muted-foreground'
                    : 'text-muted-foreground'
                }
              >
                {react}
              </span>
              <span className="flex items-center gap-2.5 font-medium">
                <span className="w-3 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {numberOf(slug)}
                </span>
                {docOf(slug).title}
                <ArrowRightIcon className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
              </span>
            </Router.Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
