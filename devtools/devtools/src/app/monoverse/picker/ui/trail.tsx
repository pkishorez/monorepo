import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Fragment, type MouseEvent } from 'react';
import type { Kind } from '../steps/index.js';
import { KindTag } from './rows.js';

/*
 * The Steps so far, above the search: "Projects", then the folders gone
 * into from `~`, each a way back to that Step, with a back button before
 * them. On a folder Step, "Open this folder" chooses the folder open, the
 * one primary action when the folder is a Monorepo or a Package itself.
 */

/** A click that leaves the keys in the search field. */
export const keepFocus = (event: MouseEvent) => event.preventDefault();

/** Folders shown before the trail folds the middle away. */
const SHOWN = 4;

export function Trail({
  crumbs,
  kind,
  canOpen,
  onBack,
  onBackTo,
  onOpen,
}: {
  /** The folders below Projects, `~` first; none on Recent. */
  readonly crumbs: ReadonlyArray<string>;
  readonly kind: Kind;
  /** Whether the folder open can be chosen now. */
  readonly canOpen: boolean;
  readonly onBack: () => void;
  /** Back to `depth` folder Steps, 0 being Recent. */
  readonly onBackTo: (depth: number) => void;
  readonly onOpen: () => void;
}) {
  const inFolder = crumbs.length > 0;
  // Projects, then `~` and the last folders, the ones between folded.
  const all = ['Projects', ...crumbs].map((label, depth) => ({ label, depth }));
  const shown =
    all.length <= SHOWN + 1
      ? all
      : [all[0]!, all[1]!, null, ...all.slice(-(SHOWN - 2))];
  const last = all.length - 1;
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 pr-2 pl-1.5">
      <nav
        aria-label="Steps"
        className="flex min-w-0 flex-1 items-center gap-0.5 text-[13px]"
      >
        {inFolder && (
          <button
            type="button"
            aria-label="Back"
            title="Back (⌫)"
            onMouseDown={keepFocus}
            onClick={onBack}
            className="relative grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 before:absolute before:-inset-1.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.96]"
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
          </button>
        )}
        {shown.map((crumb, at) => (
          <Fragment key={crumb === null ? 'fold' : crumb.depth}>
            {at > 0 && (
              <ChevronRightIcon
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground/50"
              />
            )}
            {crumb === null ? (
              <span aria-hidden className="px-1 text-muted-foreground">
                …
              </span>
            ) : crumb.depth === last ? (
              <span
                aria-current="step"
                className={cn(
                  'min-w-0 truncate px-1.5 font-medium text-foreground',
                  !inFolder && 'pl-1',
                )}
              >
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => onBackTo(crumb.depth)}
                className={cn(
                  'max-w-40 min-w-0 shrink truncate rounded-md px-1.5 py-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                )}
              >
                {crumb.label}
              </button>
            )}
          </Fragment>
        ))}
      </nav>
      {inFolder && (
        <div className="flex shrink-0 items-center gap-2">
          <KindTag kind={kind} />
          <Button
            type="button"
            size="xs"
            variant={kind === null ? 'outline' : 'default'}
            disabled={!canOpen}
            onMouseDown={keepFocus}
            onClick={onOpen}
            className="transition-[color,background-color,transform] duration-150 active:scale-[0.96] pointer-coarse:h-9 pointer-coarse:px-3 pointer-coarse:text-sm"
          >
            Open this folder
          </Button>
        </div>
      )}
    </div>
  );
}
