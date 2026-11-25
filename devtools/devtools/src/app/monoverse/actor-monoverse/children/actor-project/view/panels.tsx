import type { ReactNode, Ref } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { FolderGit2Icon } from 'lucide-react';

import { shortenHome } from '../../../../server/rpc/contract/index.js';
import { CrumbLabel, crumbTrigger } from './crumb.js';
import type { GitControlsProps } from './git-controls.js';
import { GitPanel } from './git-panel.js';
import type { PackageChanges, PackageChoice } from './package-menu.js';
import { PanelSection } from './panel-section.js';
import { PanelPackageList } from './package-list.js';

const fromMiddle = 'calc(50% + 340px)';

function Panel({
  side,
  label,
  full = false,
  children,
}: {
  side: 'left' | 'right';
  label: string;
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
  readonly path: string;
  readonly onSwitch: () => void;
  readonly packages: {
    readonly all: ReadonlyArray<PackageChoice>;
    readonly current: string | null;
    readonly changes: PackageChanges | null;
    readonly onChoose: (path: string | null) => void;
  } | null;
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
  foldersSlot: Ref<HTMLDivElement>;
}) {
  return (
    <Panel side="right" label="View">
      <GitPanel {...git} />
      <PanelSection title="Tree">
        <div ref={foldersSlot} className="flex h-8 flex-col" />
      </PanelSection>
    </Panel>
  );
}

function Divider() {
  return <div aria-hidden className="mx-2 h-px shrink-0 bg-border/60" />;
}
