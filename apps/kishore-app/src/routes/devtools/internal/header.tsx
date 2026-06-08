import type { ReactNode } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Kbd } from '@monorepo/frontend/components/ui/kbd';
import {
  ChevronsUpDownIcon,
  FlaskConicalIcon,
  FolderIcon,
  NetworkIcon,
  RotateCwIcon,
} from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/utils';

export type DevtoolsTab = 'vtest' | 'depcruise';

/**
 * The DevTools chrome toolbar: a "DevTools" home button, a segmented VTest /
 * DepCruise tool switch, a center project switcher, and a top-right reload.
 */
export function DevtoolsHeader({
  tab,
  onTab,
  onHome,
  onNavigate,
  onReload,
  selectedLabel,
  canReload,
  isReloading,
}: {
  tab: DevtoolsTab;
  onTab: (tab: DevtoolsTab) => void;
  onHome: () => void;
  onNavigate: () => void;
  onReload: () => void;
  selectedLabel: string | null;
  canReload: boolean;
  isReloading: boolean;
}) {
  return (
    <header className="flex items-center gap-4 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-background/60">
      <button
        type="button"
        onClick={onHome}
        className="shrink-0 rounded-md px-1 text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        DevTools
      </button>

      <SegmentedTabs tab={tab} onTab={onTab} />

      <div className="flex flex-1 items-center justify-center">
        <ProjectSwitcher label={selectedLabel} onClick={onNavigate} />
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onReload}
        disabled={!canReload || isReloading}
        title={isReloading ? 'Reloading…' : 'Reload'}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <RotateCwIcon className={cn('size-4', isReloading && 'animate-spin')} />
      </Button>
    </header>
  );
}

const TABS: ReadonlyArray<{
  value: DevtoolsTab;
  label: string;
  icon: typeof FlaskConicalIcon;
}> = [
  { value: 'vtest', label: 'VTest', icon: FlaskConicalIcon },
  { value: 'depcruise', label: 'DepCruise', icon: NetworkIcon },
];

/** A compact segmented control switching between the DevTools tools. */
function SegmentedTabs({
  tab,
  onTab,
}: {
  tab: DevtoolsTab;
  onTab: (tab: DevtoolsTab) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-muted/60 p-0.5"
    >
      {TABS.map(({ value, label, icon: Icon }) => {
        const active = tab === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTab(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** The center command-style trigger that opens the project switcher. */
function ProjectSwitcher({
  label,
  onClick,
}: {
  label: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        label ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <FolderIcon
        className={cn(
          'size-4 shrink-0',
          label ? 'text-primary' : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-left font-medium">
        {label ?? 'Select a project'}
      </span>
      <Hint>
        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100" />
      </Hint>
    </button>
  );
}

/** Renders a subtle trailing affordance, kept on its own to ease future swaps. */
function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Kbd className="hidden bg-background/60 sm:inline-flex">⌘K</Kbd>
      {children}
    </span>
  );
}
