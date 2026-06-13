import { BookOpenIcon } from 'lucide-react';

import { ScrollArea } from '#components/ui/scroll-area';

import type { TocSection, VtestHealth } from '../types';
import { HealthDot } from './status-dot';

/** Sentinel selection id for the package overview (`home.md`) entry. */
export const HOME_ID = '__home__';

interface TocSidebarProps {
  sections: readonly TocSection[];
  selected: string | null;
  onSelect: (feature: string) => void;
  /** Show the "Overview" entry at the top (only when the package ships `home.md`). */
  showHome?: boolean;
  /** Resolves a feature's roll-up health for its nav dot. */
  healthOf: (feature: string) => VtestHealth;
}

/** Left navigation: toc sections as headings with feature nav items + health dots. */
export function TocSidebar({
  sections,
  selected,
  onSelect,
  showHome = false,
  healthOf,
}: TocSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border md:block">
      <ScrollArea className="h-full">
        <nav className="space-y-6 p-4">
          {showHome && (
            <button
              type="button"
              onClick={() => onSelect(HOME_ID)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                selected === HOME_ID
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <BookOpenIcon className="size-4 shrink-0" />
              <span className="truncate">Overview</span>
            </button>
          )}
          {sections.length === 0 && (
            <p className="px-2 text-sm text-muted-foreground">
              No features documented in this package yet.
            </p>
          )}
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <ul className="space-y-0.5">
                {section.features.map((feature) => {
                  const isActive = feature === selected;
                  return (
                    <li key={feature}>
                      <button
                        type="button"
                        onClick={() => onSelect(feature)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-muted font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        }`}
                      >
                        <HealthDot health={healthOf(feature)} />
                        <span className="truncate">{feature}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
