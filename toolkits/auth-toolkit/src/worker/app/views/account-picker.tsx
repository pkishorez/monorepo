import { Check } from 'lucide-react';
import type { Account } from '../api/index.ts';
import { Avatar, Skeleton, cx } from '../ui/index.ts';

/*
 * The Approving Account: which of this browser's Accounts answers. Picking
 * one previews it only; the Active Account stays as it is. One Account is
 * shown as itself, with nothing to pick.
 */
export function AccountPicker({
  label,
  accounts,
  chosen,
  disabled,
  onChoose,
}: {
  /** What the choice is for: "Approve as", "Allow as". */
  label: string;
  accounts: ReadonlyArray<Account>;
  chosen: Account | undefined;
  disabled?: boolean;
  onChoose: (userId: string) => void;
}) {
  const caption = 'text-sm font-medium text-muted-fg';
  if (accounts.length <= 1 && chosen) {
    return (
      <div className="flex flex-col gap-2">
        <p className={caption}>{label}</p>
        <div className="flex min-h-[60px] items-center gap-3 rounded-xl px-3 py-2 shadow-[0_0_0_1px_var(--color-line)]">
          <Avatar {...chosen} />
          <Identity account={chosen} />
        </div>
      </div>
    );
  }
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1.5">
      <legend className={cx(caption, 'mb-2')}>{label}</legend>
      {accounts.map((account) => {
        const picked = account.id === chosen?.id;
        return (
          <label
            key={account.id}
            className={cx(
              'relative flex min-h-[60px] cursor-pointer items-center in-disabled:cursor-default gap-3 rounded-xl px-3 py-2 transition-[box-shadow,background-color] duration-150',
              picked
                ? 'bg-surface shadow-[0_0_0_2px_var(--color-accent)]'
                : 'bg-surface shadow-[0_0_0_1px_var(--color-line)] hover:bg-hover',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
            )}
          >
            <input
              type="radio"
              name="approving-account"
              value={account.id}
              checked={picked}
              onChange={() => onChoose(account.id)}
              className="sr-only"
            />
            <Avatar {...account} />
            <Identity account={account} />
            <span
              aria-hidden="true"
              className={cx(
                'grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-150',
                picked
                  ? 'bg-accent text-accent-fg'
                  : 'shadow-[inset_0_0_0_1.5px_var(--color-line)]',
              )}
            >
              {picked ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function Identity({ account }: { account: Account }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">
        {account.name || account.email}
      </span>
      <span className="block truncate text-sm text-muted-fg">
        {account.email}
      </span>
    </span>
  );
}

/** The picker while the page loads: as many rows as this browser had Accounts. */
export function PickerPlaceholder({ count }: { count: number }) {
  const row = <Skeleton className="h-[60px] rounded-xl" />;
  return count <= 1 ? (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-5 w-24" />
      {row}
    </div>
  ) : (
    // A legend sits outside the rows' gap, 8px above them.
    <div>
      <Skeleton className="mb-2 h-5 w-24" />
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className="h-[60px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
