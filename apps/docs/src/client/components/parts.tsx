import { Router } from '@kestack/kabuki/routing';
import { ArrowRightIcon } from 'lucide-react';
import { PARTS, router } from '../../shared/index.ts';

/*
 * kabuki's docs as their four Parts, in the order they are read, each a
 * way straight to its first page. Beside a shape, in half a wide screen:
 * on a phone one row by name alone, wider two by two with each package's
 * path. `wide`, with a row of its own: two by two on a phone, then four
 * across, always with the path.
 */

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function PartLinks({
  label,
  wide = false,
}: {
  readonly label: string;
  readonly wide?: boolean;
}) {
  return (
    <ol
      aria-label={label}
      className={`grid gap-px overflow-hidden rounded-2xl border border-border bg-border ${wide ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4 lg:grid-cols-2'}`}
    >
      {PARTS.map((part, index) => {
        const first = part.groups[0]!.docs[0]!;
        return (
          <li key={part.title} className="bg-background">
            <Router.Link
              to={router.Kabuki.Doc({ slug: first.slug })}
              className={`group flex h-full flex-col gap-1 p-3 text-left transition-colors duration-150 hover:bg-muted/50 lg:p-4 ${focus}`}
            >
              <span className="flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
                {`${index + 1}`.padStart(2, '0')}
                <ArrowRightIcon className="size-3.5 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none" />
              </span>
              <span className="font-semibold tracking-tight">{part.title}</span>
              <span
                className={`truncate font-mono text-[11px] text-muted-foreground ${wide ? '' : 'max-lg:hidden'}`}
              >
                {part.path}
              </span>
            </Router.Link>
          </li>
        );
      })}
    </ol>
  );
}
