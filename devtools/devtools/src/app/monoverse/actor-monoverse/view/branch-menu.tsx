import { useState, type ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@kestack/web-platform/ui/components/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { ChevronDownIcon } from 'lucide-react';

import { shortenHome } from '../../server/rpc/contract/index.js';
import type { Branch } from '../../server/rpc/git/contract/index.js';

/*
 * One branch control: a quiet button naming the branch chosen, opening a
 * list of the repository's local branches to choose another, searchable
 * once there are more than a handful.
 */

/** Past this many branches, the list gets a search field. */
const searchFrom = 8;

export function BranchMenu({
  label,
  icon,
  prefix,
  chosen,
  current,
  branches,
  disabled,
  onChoose,
  className,
}: {
  /** What the control is, for assistive technology and its tooltip. */
  label: string;
  icon: ReactNode;
  /** A muted word before the branch's name, like `vs`. */
  prefix?: string;
  /** The branch chosen; null: none yet. */
  chosen: string | null;
  /** The branch the project's own folder has checked out. */
  current: string | null;
  branches: ReadonlyArray<Branch>;
  disabled?: boolean;
  onChoose: (name: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`${label}: ${chosen ?? 'none'}`}
        title={chosen === null ? label : `${label}: ${chosen}`}
        className={cn(
          'inline-flex h-8 max-w-56 max-sm:max-w-32 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm text-foreground/90 transition-colors duration-150 outline-none select-none',
          'hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-muted/70',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
          '[&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        )}
      >
        {icon}
        {prefix === undefined ? null : (
          <span className="text-muted-foreground">{prefix}</span>
        )}
        <span className="min-w-0 truncate font-mono text-[12.5px]">
          {chosen ?? '—'}
        </span>
        <ChevronDownIcon className="size-3.5 opacity-70" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <Command
          loop
          className="rounded-md! bg-transparent"
          // The chosen branch starts highlighted, so Enter keeps it.
          defaultValue={chosen ?? undefined}
        >
          {branches.length > searchFrom ? (
            <CommandInput
              placeholder="Find a branch…"
              aria-label="Find a branch"
            />
          ) : null}
          <CommandList className="max-h-80 p-1">
            <CommandEmpty className="py-6 text-xs text-muted-foreground">
              No branch matches.
            </CommandEmpty>
            {branches.map((branch) => (
              <CommandItem
                key={branch.name}
                value={branch.name}
                data-checked={branch.name === chosen}
                onSelect={() => {
                  setOpen(false);
                  if (branch.name !== chosen) onChoose(branch.name);
                }}
                className="gap-2 py-1.5"
              >
                <span
                  title={branch.name}
                  className="min-w-0 flex-1 truncate font-mono text-[12.5px]"
                >
                  {branch.name}
                </span>
                <BranchMarks branch={branch} current={current} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** What sets a branch apart: the project folder's own, or another worktree's. */
function BranchMarks({
  branch,
  current,
}: {
  branch: Branch;
  current: string | null;
}) {
  if (branch.name === current)
    return <Mark title="The branch the project folder is on">current</Mark>;
  if (branch.worktree !== null)
    return (
      <Mark title={`Checked out in ${shortenHome(branch.worktree)}`}>
        worktree
      </Mark>
    );
  return null;
}

function Mark({ title, children }: { title: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className="shrink-0 rounded-sm px-1 text-[10px] font-medium tracking-wide text-muted-foreground/80 ring-1 ring-border/70"
    >
      {children}
    </span>
  );
}
