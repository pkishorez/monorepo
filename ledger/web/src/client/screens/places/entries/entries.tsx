import { MousePointerClick } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { usePlace, useWide } from '../../parts/index.ts';
import { EntryPane } from './entry.tsx';
import type { EntriesSearch } from './filter.ts';
import { EntriesList } from './list.tsx';

// What the header leaves of the screen's height: the two columns each
// scroll within it, so the list keeps its place as an Entry opens.
const COLUMN =
  '@3xl:sticky @3xl:top-0 @3xl:h-[calc(100dvh-3rem)] @3xl:overflow-y-auto';

/**
 * Entries: the list, and the open Entry. With room for two columns both
 * show side by side, as in a mail app; without, one at a time.
 */
export function Entries(props: {
  readonly search: EntriesSearch;
  readonly open: string | undefined;
}) {
  const { open, search } = props;
  const wide = useWide();
  usePlace(open === undefined ? 'entries' : 'entries.entry');
  return (
    <div className="flex">
      <div
        className={cn(
          'min-w-0 flex-1 @3xl:max-w-md @3xl:flex-none @3xl:basis-[24rem] @3xl:border-r',
          COLUMN,
          open !== undefined && 'hidden @3xl:block',
        )}
      >
        <EntriesList search={search} open={open} wide={wide} />
      </div>
      {open !== undefined ? (
        <div className={cn('min-w-0 flex-1', COLUMN)}>
          <EntryPane id={open} search={search} wide={wide} />
        </div>
      ) : (
        <div
          className={cn(
            'hidden flex-1 place-items-center text-sm text-muted-foreground @3xl:grid',
            COLUMN,
          )}
        >
          <span className="flex items-center gap-2">
            <MousePointerClick className="size-4" aria-hidden="true" /> Open an
            entry
          </span>
        </div>
      )}
    </div>
  );
}
