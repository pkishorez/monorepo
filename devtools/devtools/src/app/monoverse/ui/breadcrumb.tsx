import { cn } from '@kestack/web-platform/ui/components/utils';
import { FolderGit2Icon } from 'lucide-react';

import { shortenHome } from '../model/index.js';
import { CrumbLabel, crumbTrigger } from './crumb.js';
import {
  PackageMenu,
  type PackageChanges,
  type PackageChoice,
} from './package-menu.js';

/*
 * Where you are, top left, on one line: the project, a menu that opens
 * the picker, and in a Monorepo the Package shown, or All packages, a
 * menu to go straight to another or back to the Monorepo's tree. A Single
 * Package is its project alone.
 */

export function Breadcrumb({
  project,
  path,
  packages,
  onSwitch,
}: {
  /** The project's name. */
  project: string;
  /** Its folder, absolute. */
  path: string;
  /** A Monorepo's Packages, the one shown, and where a choice goes; null for a Single Package. */
  packages: {
    readonly all: ReadonlyArray<PackageChoice>;
    /** By its folder; null: the Monorepo's tree. */
    readonly current: string | null;
    /** While Changes is on, what changed in each; null while it is off. */
    readonly changes: PackageChanges | null;
    readonly onChoose: (path: string | null) => void;
  } | null;
  onSwitch: () => void;
}) {
  return (
    <nav aria-label="Where" className="flex min-w-0 flex-1 items-center">
      <ol className="flex min-w-0 items-center gap-0.5">
        <li className="flex min-w-0 shrink items-center">
          <button
            type="button"
            onClick={onSwitch}
            aria-label={`Project: ${project}`}
            title={`${shortenHome(path)}: open another project`}
            className={cn(
              crumbTrigger,
              packages === null ? 'max-w-72' : 'max-w-64 max-sm:max-w-[45vw]',
            )}
          >
            <CrumbLabel icon={FolderGit2Icon}>{project}</CrumbLabel>
          </button>
        </li>
        {packages === null ? null : (
          <li
            aria-current="page"
            className="flex min-w-0 shrink-[2] items-center"
          >
            <span
              aria-hidden
              className="px-0.5 text-sm text-muted-foreground/50"
            >
              /
            </span>
            <PackageMenu
              packages={packages.all}
              current={packages.current}
              changes={packages.changes}
              onChoose={packages.onChoose}
            />
          </li>
        )}
      </ol>
    </nav>
  );
}
