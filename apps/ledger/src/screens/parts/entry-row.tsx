import { cn } from '@kstackz/web-platform/components/utils';
import type { Account, Category, Entry } from '../../model/index.ts';
import { Amount } from './amount.tsx';
import { CategoryIcon } from './icons.tsx';

/**
 * One Entry in a list: its Category, memo and Account, and the amount.
 * `marked` is the one the keys or the Thumb Lock are on; `open` is the one
 * shown beside the list.
 */
export function EntryRow(props: {
  readonly entry: Entry;
  readonly category: Category | undefined;
  readonly account: Account | undefined;
  readonly currency: string;
  readonly marked?: boolean;
  readonly open?: boolean;
  readonly onClick?: () => void;
}) {
  const { entry, category, account } = props;
  return (
    <button
      type="button"
      data-entry={entry.id}
      data-marked={props.marked ? '' : undefined}
      aria-current={props.open ? 'true' : undefined}
      onClick={props.onClick}
      className={cn(
        'focus-ring flex w-full scroll-my-24 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-100',
        'hover:bg-accent/60',
        (props.marked || props.open) && 'bg-accent',
      )}
    >
      <CategoryIcon icon={category?.icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {entry.memo || category?.name || 'Entry'}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {category?.name ?? 'No category'} · {account?.name ?? 'No account'}
        </span>
      </span>
      <Amount cents={entry.cents} way={entry.way} currency={props.currency} />
    </button>
  );
}
