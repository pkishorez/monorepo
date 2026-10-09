import { Button } from '@kstackz/web-platform/components/button';

const FILTERS = ['All', 'Active', 'Completed'] as const;
type Filter = (typeof FILTERS)[number];

/** Counts, the filter, and the actions on the whole list. */
export const Footer = ({
  active,
  completed,
  filter,
  onFilter,
  onToggleAll,
  onClearCompleted,
}: {
  readonly active: number;
  readonly completed: number;
  readonly filter: Filter;
  readonly onFilter: (filter: Filter) => void;
  readonly onToggleAll: () => void;
  readonly onClearCompleted: () => void;
}) => (
  <div className="flex flex-col items-center gap-3 border-t pt-4">
    <p role="status" className="text-sm text-muted-foreground">
      {active} active, {completed} completed
    </p>
    <div role="group" aria-label="Filter" className="flex gap-1">
      {FILTERS.map((each) => (
        <Button
          key={each}
          size="sm"
          variant={each === filter ? 'secondary' : 'ghost'}
          aria-pressed={each === filter}
          onClick={() => onFilter(each)}
        >
          {each}
        </Button>
      ))}
    </div>
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={onToggleAll}>
        {active === 0 ? 'Mark all active' : 'Mark all complete'}
      </Button>
      {completed > 0 && (
        <Button size="sm" variant="destructive" onClick={onClearCompleted}>
          Clear {completed} completed
        </Button>
      )}
    </div>
  </div>
);
