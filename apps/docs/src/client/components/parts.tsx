import { Router } from '@kestack/kabuki/routing';
import { ArrowRightIcon } from 'lucide-react';
import { packageOf } from '../../shared/index.ts';
import type { Package } from '../../shared/index.ts';
import { docRoute } from './package-link.tsx';
import { focus } from './styles.ts';

/*
 * A package's docs as its Parts, in the order they are read, each a
 * way straight to its first page. Beside a shape, in half a wide screen:
 * on a phone one row by name alone, wider two by two with each package's
 * path. `wide`, with a row of its own: two by two on a phone, then four
 * across, always with the path.
 */

/**
 * Four Parts sit in one row on a phone and two by two beside a shape; five
 * sit two by two, the last across both columns, and in one row when wide.
 */
const columns = (count: number, wide: boolean): string =>
  count === 4
    ? wide
      ? 'grid-cols-2 sm:grid-cols-4'
      : 'grid-cols-4 lg:grid-cols-2'
    : wide
      ? 'grid-cols-2 sm:grid-cols-5'
      : 'grid-cols-2';

export function PartLinks({
  id,
  label,
  wide = false,
}: {
  readonly id: Package['id'];
  readonly label: string;
  readonly wide?: boolean;
}) {
  const { parts } = packageOf(id).contents;
  return (
    <ol
      aria-label={label}
      className={`grid gap-px overflow-hidden rounded-2xl border border-border bg-border ${columns(parts.length, wide)}`}
    >
      {parts.map((part, index) => {
        const first = part.groups[0]!.docs[0]!;
        return (
          <li
            key={part.title}
            className={`bg-background ${parts.length % 2 === 1 && index === parts.length - 1 ? (wide ? 'max-sm:col-span-2' : 'col-span-2') : ''}`}
          >
            <Router.Link
              to={docRoute(id, first.slug)}
              className={`group flex h-full flex-col gap-1 p-3 text-left transition-colors duration-150 hover:bg-muted/50 lg:p-4 ${focus}`}
            >
              <span className="flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
                {`${index + 1}`.padStart(2, '0')}
                <ArrowRightIcon className="size-3.5 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none" />
              </span>
              <span className="font-semibold tracking-tight">{part.title}</span>
              <span
                className={`truncate font-mono text-[11px] text-muted-foreground ${wide || parts.length !== 4 ? '' : 'max-lg:hidden'}`}
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
