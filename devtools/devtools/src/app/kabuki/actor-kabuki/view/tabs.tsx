import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Tab } from '../logic/shared/index.js';

const TABS: ReadonlyArray<{ readonly tab: Tab; readonly label: string }> = [
  { tab: 'inspector', label: 'Inspector' },
  { tab: 'story', label: 'Story' },
];

export function Tabs({
  tab,
  onTab,
}: {
  readonly tab: Tab;
  readonly onTab: (tab: Tab) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show"
      className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/50 p-0.5"
    >
      {TABS.map(({ tab: one, label }) => (
        <button
          key={one}
          type="button"
          aria-pressed={one === tab}
          onClick={() => onTab(one)}
          className={cn(
            'h-6 rounded-[5px] px-2.5 text-xs text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            one === tab &&
              'bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
