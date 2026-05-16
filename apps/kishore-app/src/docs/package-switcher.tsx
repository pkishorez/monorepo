import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, ChevronsUpDownIcon } from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@monorepo/frontend/components/ui/popover';

import { type DocsEntry, docsByCollection } from './registry';

export function PackageSwitcher({ current }: { current: DocsEntry }) {
  const groups = docsByCollection();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="hover:bg-muted/60 -mx-1.5 -my-1 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors"
          />
        }
      >
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground/70 text-[10px] font-semibold tracking-wider uppercase">
            {current.collection}
          </div>
          <div className="text-foreground truncate font-mono text-sm font-semibold tracking-tight">
            {current.title}
          </div>
          <div className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
            {current.report.package.name} · v{current.report.package.version}
          </div>
        </div>
        <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-72 gap-0 p-0"
      >
        <Link
          to="/docs"
          className="hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center gap-2 border-b px-3 py-2.5 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-3.5" />
          All docs
        </Link>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {groups.map(({ collection, entries }) => (
            <div key={collection} className="px-2 pb-2">
              <div className="text-muted-foreground px-2 py-1.5 text-[10px] font-semibold tracking-wider uppercase">
                {collection}
              </div>
              <div className="flex flex-col">
                {entries.map((entry) => {
                  const active = entry.slug === current.slug;
                  return (
                    <Link
                      key={entry.slug}
                      to="/docs/$pkg"
                      params={{ pkg: entry.slug }}
                      className={cn(
                        'rounded-md px-2 py-1.5 transition-colors',
                        active
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <div className="text-sm font-medium">{entry.title}</div>
                      <div className="text-muted-foreground/80 truncate font-mono text-[11px]">
                        {entry.report.package.name}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
