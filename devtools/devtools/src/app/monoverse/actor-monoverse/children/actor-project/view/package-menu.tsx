import { useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@kestack/web-platform/ui/components/command';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@kestack/web-platform/ui/components/drawer';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { BoxIcon, LayersIcon } from 'lucide-react';

import type { Check } from '../logic/shared/index.js';
import { CrumbLabel, crumbTrigger } from './crumb.js';
import { CheckMark, usePhone } from './shared/index.js';

export interface PackageChoice {
  readonly name: string;
  readonly path: string;
  readonly version?: string | undefined;
  readonly check?: Check | undefined;
}

export interface PackageChange {
  readonly count: number;
  readonly status: 'added' | 'modified' | 'deleted';
}

export interface PackageChanges {
  readonly of: ReadonlyMap<string, PackageChange>;
  readonly unchanged: 'show' | 'dim' | 'hide';
}

const tone: Record<PackageChange['status'], string> = {
  added: 'text-added',
  modified: 'text-changed',
  deleted: 'text-removed',
};

const all = '\u0000all';

export function PackageMenu({
  packages,
  current,
  changes,
  onChoose,
}: {
  packages: ReadonlyArray<PackageChoice>;
  changes: PackageChanges | null;
  current: string | null;
  onChoose: (path: string | null) => void;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const shown = packages.find((one) => one.path === current);
  const label = shown?.name ?? 'All packages';
  const choose = (path: string | null) => {
    setOpen(false);
    if (path !== current) onChoose(path);
  };
  const trigger = {
    'aria-label': `Package: ${label}`,
    title:
      shown === undefined
        ? 'Go to a package'
        : `${shown.path}: go to another package`,
    className: cn(crumbTrigger, 'max-w-72'),
    children: (
      <CrumbLabel icon={current === null ? LayersIcon : BoxIcon}>
        {label}
      </CrumbLabel>
    ),
  };
  const list = (
    <PackageList
      packages={packages}
      current={current}
      changes={changes}
      onChoose={choose}
    />
  );

  if (phone)
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger {...trigger} />
        <DrawerContent initialFocus={(how) => how !== 'touch'}>
          <DrawerHeader className="pb-1">
            <DrawerTitle>Packages</DrawerTitle>
          </DrawerHeader>
          <div className="flex min-h-0 flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {list}
          </div>
        </DrawerContent>
      </Drawer>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger {...trigger} />
      <PopoverContent align="start" className="w-80 gap-0 p-0">
        {list}
      </PopoverContent>
    </Popover>
  );
}

export function orderPackages(
  packages: ReadonlyArray<PackageChoice>,
  current: string | null,
  changes: PackageChanges | null,
): {
  readonly changed: ReadonlyArray<PackageChoice>;
  readonly rest: ReadonlyArray<PackageChoice>;
} {
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name));
  if (changes === null) return { changed: [], rest: sorted };
  return {
    changed: sorted.filter((one) => changes.of.has(one.path)),
    rest: sorted.filter(
      (one) =>
        !changes.of.has(one.path) &&
        (changes.unchanged !== 'hide' || one.path === current),
    ),
  };
}

function PackageList({
  packages,
  current,
  changes,
  onChoose,
}: {
  packages: ReadonlyArray<PackageChoice>;
  current: string | null;
  changes: PackageChanges | null;
  onChoose: (path: string | null) => void;
}) {
  const { changed, rest } = orderPackages(packages, current, changes);
  const item = (one: PackageChoice, quiet: boolean) => {
    const change = changes?.of.get(one.path);
    return (
      <CommandItem
        key={one.path}
        value={one.path}
        keywords={[one.name]}
        data-checked={one.path === current}
        onSelect={() => onChoose(one.path)}
        className={cn(
          'gap-2 py-1.5 max-sm:min-h-11',
          quiet && 'opacity-50 data-selected:opacity-100',
        )}
      >
        <BoxIcon
          className={cn(
            'size-4',
            change === undefined
              ? 'text-muted-foreground'
              : tone[change.status],
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">
            {one.name}
            {one.version === undefined ? null : (
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                {one.version}
              </span>
            )}
          </span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {one.path}
          </span>
        </span>
        <CheckMark check={one.check} />
        {change === undefined ? null : (
          <span
            title={`${change.count} ${change.count === 1 ? 'file' : 'files'} changed`}
            className={cn('shrink-0 text-xs tabular-nums', tone[change.status])}
          >
            {change.count}
          </span>
        )}
      </CommandItem>
    );
  };
  const heading =
    'text-[11px] font-medium text-muted-foreground px-2 pt-2 pb-1 select-none';
  return (
    <Command
      loop
      className="rounded-md! bg-transparent"
      defaultValue={current ?? all}
    >
      <CommandInput placeholder="Find a package…" aria-label="Find a package" />
      <CommandList className="max-h-80 scroll-pt-12 p-1 max-sm:max-h-[60dvh] max-sm:scroll-pt-14">
        <CommandGroup
          value="all"
          className="sticky -top-1 z-10 -mx-1 -mt-1 overflow-visible border-b border-border/60 bg-popover p-1"
        >
          <CommandItem
            value={all}
            keywords={['all packages', 'monorepo']}
            data-checked={current === null}
            onSelect={() => onChoose(null)}
            className="gap-2 py-1.5 max-sm:min-h-11"
          >
            <LayersIcon className="size-4 text-muted-foreground" />
            <span className="flex-1">All packages</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {packages.length}
            </span>
          </CommandItem>
        </CommandGroup>
        <CommandEmpty className="py-6 text-xs text-muted-foreground">
          No package matches.
        </CommandEmpty>
        {changes === null ? (
          <CommandGroup value="packages" className="p-0 pt-1">
            {rest.map((one) => item(one, false))}
          </CommandGroup>
        ) : (
          <>
            <CommandGroup value="changed" className="p-0 pt-1">
              <div aria-hidden className={heading}>
                {changed.length === 0
                  ? 'No package changed'
                  : `Changed · ${changed.length}`}
              </div>
              {changed.map((one) => item(one, false))}
            </CommandGroup>
            {rest.length === 0 ? null : (
              <CommandGroup value="unchanged" className="p-0 pt-1">
                <div aria-hidden className={heading}>
                  Unchanged
                </div>
                {rest.map((one) => item(one, changes.unchanged === 'dim'))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </Command>
  );
}
