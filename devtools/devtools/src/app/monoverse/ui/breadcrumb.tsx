import { cn } from '@kestack/web-platform/ui/components/utils';
import { ChevronRightIcon, ChevronsUpDownIcon } from 'lucide-react';

import { shortenHome } from '../model/index.js';

/*
 * Where you are, top left: the project, and the Package entered in it, if
 * one is. The project's crumb goes back to its tree from a Package, and
 * otherwise opens the picker; the chevrons beside it always open it.
 */

const crumb =
  'inline-flex h-7 min-w-0 items-center rounded-md px-1.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

export function Breadcrumb({
  project,
  path,
  inside,
  onProject,
  onSwitch,
}: {
  /** The project's name. */
  project: string;
  /** Its folder, absolute. */
  path: string;
  /** The Package entered, by its name; null for none. */
  inside: string | null;
  onProject: () => void;
  onSwitch: () => void;
}) {
  return (
    <nav aria-label="Where" className="flex min-w-0 items-center gap-0.5">
      <ol className="flex min-w-0 items-center gap-0.5">
        <li className="flex min-w-0 items-center">
          <button
            type="button"
            onClick={onProject}
            title={
              inside === null
                ? `${shortenHome(path)}: open another project`
                : `Back to ${project}`
            }
            className={cn(
              crumb,
              'max-w-64 hover:bg-muted/70',
              inside === null
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="truncate">{project}</span>
          </button>
          <button
            type="button"
            onClick={onSwitch}
            aria-label="Open another project"
            title="Open another project"
            className={cn(
              crumb,
              'size-7 justify-center px-0 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            )}
          >
            <ChevronsUpDownIcon className="size-3.5" />
          </button>
        </li>
        {inside === null ? null : (
          <li aria-current="page" className="flex min-w-0 items-center gap-0.5">
            <ChevronRightIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground/60"
            />
            <span className={cn(crumb, 'max-w-72 font-medium text-foreground')}>
              <span className="truncate">{inside}</span>
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}
