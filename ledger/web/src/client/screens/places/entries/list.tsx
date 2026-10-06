import { toast } from '@kstackz/ui-toolkit/components/ui/sonner';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Inbox, Pencil, X } from '@kstackz/ui-toolkit/lucide';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { keys, useCommand } from '@ledger/core/client/commands';
import { useMoney, useWrites } from '@ledger/core/client/session';
import { byDay, dayName, type Entry, signed } from '@ledger/core/shared/ledger';
import { useOpenAccount } from '../../sheets/accounts/index.ts';
import {
  Amount,
  EntryRow,
  scrollMarked,
  useLookup,
} from '../../parts/index.ts';
import {
  type EntriesSearch,
  narrowedTo,
  narrowing,
  shownBy,
} from './filter.ts';
import { SwipeRow } from './swipe-row.tsx';

/**
 * The list of Entries, by day, with one marked: Next and Previous move the
 * mark, and on a wide screen with an Entry open the Entry follows it.
 * Its keys work while its Surface is Active; Jump has nowhere to go.
 */
export function EntriesList(props: {
  readonly search: EntriesSearch;
  readonly open: string | undefined;
  readonly wide: boolean;
}) {
  const { search, open, wide } = props;
  const money = useMoney();
  const lookup = useLookup(money);
  const navigate = useNavigate();
  const { surface, setSurface } = keys.useSurface();
  const { removeEntry, restoreEntry } = useWrites();
  const shown = shownBy(money.entries, search);
  const [marked, setMarked] = useState(search.at ?? open ?? shown[0]?.id);
  const removed = useRef<Entry>(undefined);
  const openAccount = useOpenAccount();
  const list = useRef<HTMLDivElement>(null);
  const currency = money.currency;

  // The mark follows the open Entry, and the first one once there are any.
  useEffect(() => {
    if (open !== undefined) setMarked(open);
  }, [open]);
  useEffect(() => {
    if (marked === undefined && shown[0]) setMarked(shown[0].id);
  }, [marked, shown]);
  useEffect(() => {
    if (list.current) scrollMarked(list.current);
  }, [marked]);

  const at = shown.findIndex((entry) => entry.id === marked);
  // Marks an Entry; with one open beside the list, it opens instead.
  const markEntry = (id: string) => {
    setMarked(id);
    if (wide && open !== undefined) {
      void navigate({
        to: '/entries/$entryId',
        params: { entryId: id },
        search: narrowing(search),
        replace: true,
      });
    }
  };
  const mark = (index: number) => {
    const entry = shown[Math.max(0, Math.min(index, shown.length - 1))];
    if (entry !== undefined) markEntry(entry.id);
  };
  const openEntry = (id: string) => {
    setSurface('entries.entry');
    if (id !== open) {
      void navigate({
        to: '/entries/$entryId',
        params: { entryId: id },
        search: narrowing(search),
      });
    }
  };

  const active = surface === 'entries';
  useCommand('next', () => mark(at + 1), {
    enabled: active && at < shown.length - 1,
  });
  useCommand('previous', () => mark(at - 1), { enabled: active && at > 0 });
  useCommand('entries.top', () => mark(0), { enabled: active });
  useCommand('entries.bottom', () => mark(shown.length - 1), {
    enabled: active,
  });
  useCommand('entries.open', () => marked && openEntry(marked), {
    enabled: active && marked !== undefined,
  });
  // Deletes an Entry, marking the one after it if it was marked, with a
  // way back.
  const remove = (entry: Entry) => {
    const index = shown.indexOf(entry);
    removed.current = entry;
    if (entry.id === marked) {
      mark(index + 1 < shown.length ? index + 1 : index - 1);
    }
    removeEntry(entry.id);
    toast(`Deleted ${entry.memo || 'the entry'}`, {
      action: { label: 'Undo', onClick: () => restoreEntry(entry) },
    });
  };
  useCommand(
    'entries.remove',
    () => {
      const entry = shown[at];
      if (entry) remove(entry);
    },
    { enabled: active && at >= 0 },
  );
  useCommand(
    'entries.undo',
    () => {
      const entry = removed.current;
      if (entry === undefined) return;
      removed.current = undefined;
      restoreEntry(entry);
      markEntry(entry.id);
    },
    { enabled: active },
  );

  const narrowed = narrowedTo(money, search);
  return (
    <div ref={list} className="px-2 pb-28">
      {narrowed && (
        <div className="flex items-center justify-between gap-2 px-2 pt-4">
          <span className="min-w-0 truncate text-sm font-medium">
            {narrowed}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {search.account && (
              <Button
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => openAccount(search.account)}
              >
                <Pencil aria-hidden="true" /> Rename
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              nativeButton={false}
              render={<Link to="/entries" />}
            >
              Everything <X aria-hidden="true" />
            </Button>
          </span>
        </div>
      )}
      {money.ready && shown.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center text-muted-foreground">
          <Inbox className="size-8" aria-hidden="true" />
          <p className="text-sm">No entries here yet.</p>
        </div>
      )}
      {byDay(shown).map(([day, entries]) => {
        const net = entries.reduce(
          (sum, entry) => sum + signed(entry.cents, entry.way),
          0,
        );
        return (
          <section key={day} className="pt-4">
            <h3 className="sticky top-0 z-[1] flex items-center justify-between bg-background px-3 py-1.5 text-xs text-muted-foreground">
              {dayName(day)}
              <Amount cents={net} currency={currency} />
            </h3>
            {entries.map((entry) => (
              <SwipeRow key={entry.id} onDelete={() => remove(entry)}>
                <EntryRow
                  entry={entry}
                  category={lookup.category.get(entry.categoryId)}
                  account={lookup.account.get(entry.accountId)}
                  currency={currency}
                  marked={entry.id === marked && (active || open === undefined)}
                  open={entry.id === open && wide}
                  onClick={() => {
                    setMarked(entry.id);
                    openEntry(entry.id);
                  }}
                />
              </SwipeRow>
            ))}
          </section>
        );
      })}
    </div>
  );
}
