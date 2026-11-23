import type { ReactNode, Ref } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { FolderGit2Icon } from 'lucide-react';

import { GitPanel, type GitControlsProps } from '../git-controls/index.js';
import { shortenHome } from '../model/index.js';
import { PanelPackageList } from './package-list.js';
import {
  CrumbLabel,
  PanelSection,
  crumbTrigger,
  type PackageChanges,
  type PackageChoice,
} from '../ui/index.js';

/*
 * A wide screen's controls, in two panels hugging the centred tree, so the
 * pointer never travels far: on the left, where you are (the project,
 * what is selected, and in a Monorepo All packages and every Package, one
 * click away); on the right, what you see (the branch, what it is
 * compared to, Changes and what the tree draws, and the tree put back
 * as it opened). Each stays put as the tree scrolls, and always in the same
 * place, whatever tree is shown. Nothing in them moves as the tree loads,
 * changes or is selected in: the left runs the full height whatever it
 * holds, and the places the tree fills keep their size while it is away.
 */

/** From the middle of the screen to a panel's near edge: half the widest tree, and a gap. */
const fromMiddle = 'calc(50% + 340px)';

function Panel({
  side,
  label,
  full = false,
  children,
}: {
  side: 'left' | 'right';
  label: string;
  /** Top to bottom of the screen, whatever it holds. */
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      style={side === 'left' ? { right: fromMiddle } : { left: fromMiddle }}
      className={cn(
        'absolute top-4 z-10 flex w-[min(17rem,calc(50%-340px-1rem))] flex-col gap-2 rounded-xl bg-background p-1.5',
        full ? 'bottom-4' : 'max-h-[calc(100%-2rem)]',
        'shadow-[0_0_0_1px_var(--color-border),0_2px_8px_-4px_rgb(0_0_0/0.12)]',
      )}
    >
      {children}
    </aside>
  );
}

export interface WherePanelProps {
  readonly project: string;
  /** The project's folder, absolute. */
  readonly path: string;
  readonly onSwitch: () => void;
  /** A Monorepo's Packages, the one shown, and where a choice goes; null for a Single Package. */
  readonly packages: {
    readonly all: ReadonlyArray<PackageChoice>;
    readonly current: string | null;
    readonly changes: PackageChanges | null;
    readonly onChoose: (path: string | null) => void;
  } | null;
  /** Where the tree draws what is selected. */
  readonly selectionSlot: Ref<HTMLDivElement>;
}

export function WherePanel({
  project,
  path,
  onSwitch,
  packages,
  selectionSlot,
}: WherePanelProps) {
  return (
    <Panel side="left" label="Where" full>
      <button
        type="button"
        onClick={onSwitch}
        aria-label={`Project: ${project}`}
        title={`${shortenHome(path)}: open another project`}
        className={cn(
          crumbTrigger,
          'h-9 w-full shrink-0 px-2 [&>span.truncate]:flex-1 [&>span.truncate]:text-left',
        )}
      >
        <CrumbLabel icon={FolderGit2Icon}>{project}</CrumbLabel>
      </button>
      <Divider />
      {/* The selection card's own height, held while the tree loads. */}
      <div ref={selectionSlot} className="h-24 shrink-0" />
      {packages === null ? null : (
        <>
          <Divider />
          <PanelSection title="Packages" className="min-h-0 flex-1">
            <PanelPackageList
              packages={packages.all}
              current={packages.current}
              changes={packages.changes}
              onChoose={packages.onChoose}
            />
          </PanelSection>
        </>
      )}
    </Panel>
  );
}

export function ViewPanel({
  foldersSlot,
  ...git
}: GitControlsProps & {
  /** Where the tree draws its button back to the default view. */
  foldersSlot: Ref<HTMLDivElement>;
}) {
  return (
    <Panel side="right" label="View">
      <GitPanel {...git} />
      <PanelSection title="Tree">
        {/* The reset button's own height, held while the tree loads. */}
        <div ref={foldersSlot} className="flex h-8 flex-col" />
      </PanelSection>
    </Panel>
  );
}

/** A hairline between a panel's groups, in place of a heading for each. */
function Divider() {
  return <div aria-hidden className="mx-2 h-px shrink-0 bg-border/60" />;
}
