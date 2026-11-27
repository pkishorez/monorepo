import { Fragment } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { FolderOpenIcon } from 'lucide-react';

import type { Crumb } from '../../logic/shared/index.js';

const crumbButton =
  'h-6 min-w-0 truncate rounded-md px-1 text-muted-foreground transition-colors duration-150 outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-sm:h-8';

function Slash({ className }: { className?: string }) {
  return (
    <li
      aria-hidden
      className={cn('shrink-0 px-0.5 text-muted-foreground/50', className)}
    >
      /
    </li>
  );
}

export function FocusTrail({
  trail,
  onFocus,
  onLeave,
}: {
  trail: ReadonlyArray<Crumb>;
  onFocus: (path: string | null) => void;
  onLeave: (() => void) | null;
}) {
  const last = trail.length - 1;
  const folded = (index: number) => index > 0 && index < last - 1;
  const up = trail[last - 1];
  return (
    <nav aria-label="Folder shown" className="-ml-1 min-w-0">
      <ol className="flex min-w-0 items-center text-xs">
        {onLeave === null ? null : (
          <>
            <li className="flex shrink-0">
              <button
                type="button"
                title="Show all packages"
                className={crumbButton}
                onClick={onLeave}
              >
                All packages
              </button>
            </li>
            <Slash />
          </>
        )}
        {trail.map((crumb, index) => (
          <Fragment key={crumb.path ?? ''}>
            {index === 0 ? null : (
              <Slash className={folded(index) ? 'max-sm:hidden' : undefined} />
            )}
            {index === last - 1 && last > 1 && up !== undefined ? (
              <li className="flex shrink-0 sm:hidden">
                <button
                  type="button"
                  title={`Show only ${up.path ?? up.name}`}
                  aria-label={`Up to ${up.name}`}
                  className={crumbButton}
                  onClick={() => onFocus(up.path)}
                >
                  …
                </button>
              </li>
            ) : null}
            <li
              className={cn(
                'flex min-w-0',
                index === last ? 'shrink-0' : 'shrink',
                (folded(index) || (index === last - 1 && last > 1)) &&
                  'max-sm:hidden',
              )}
            >
              {index === last ? (
                <span
                  aria-current="location"
                  className="flex min-w-0 items-center gap-1 px-1 font-medium text-foreground"
                >
                  <FolderOpenIcon
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{crumb.name}</span>
                </span>
              ) : (
                <button
                  type="button"
                  title={
                    crumb.path === null
                      ? `Show all of ${crumb.name}`
                      : `Show only ${crumb.path}`
                  }
                  className={crumbButton}
                  onClick={() => onFocus(crumb.path)}
                >
                  {crumb.name}
                </button>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
