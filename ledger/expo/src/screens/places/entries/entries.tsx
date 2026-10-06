import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import InboxIcon from '@hugeicons/core-free-icons/InboxIcon';
import PencilEdit01Icon from '@hugeicons/core-free-icons/PencilEdit01Icon';
import { Button } from '@kstackz/expo-toolkit/components/button';
import { Glyph } from '@kstackz/expo-toolkit/components/glyph';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { SwipeRow } from '@kstackz/expo-toolkit/patterns/swipe-row';
import { keys, useCommand, usePlace } from '@ledger/core/client/commands';
import { useMoney, useWrites } from '@ledger/core/client/session';
import {
  type EntriesSearch,
  markAfterRemoving,
  narrowedTo,
  narrowing,
  shownBy,
  useLookup,
} from '@ledger/core/client/views';
import { byDay, dayName, type Entry, signed } from '@ledger/core/shared/ledger';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { SectionList, View } from 'react-native';
import { useSettings } from '../../../ledger';
import { useOpenAccount } from '../../sheets/accounts';
import { Amount, EntryRow } from '../../parts';
import { useRemoveEntry } from './remove';

/**
 * Entries, a Place: the Entries a search shows, by day, newest first. A tap
 * opens one; a swipe left deletes it, with a way back. Nothing is marked
 * until Jump comes back from an Entry, or Next and Previous move the mark.
 */
export function Entries(props: { readonly search: EntriesSearch }) {
  usePlace('entries');
  const { search } = props;
  const money = useMoney();
  const { restoreEntry } = useWrites();
  const lookup = useLookup(money);
  const router = useRouter();
  const settings = useSettings();
  const { surface } = keys.useSurface();
  const shown = shownBy(money.entries, search);
  const [marked, setMarked] = useState(search.at);
  const removed = useRef<Entry>(undefined);
  const list = useRef<SectionList<Entry>>(null);
  const openAccount = useOpenAccount();
  const currency = money.currency;
  const days = byDay(shown);
  const sections = days.map(([day, data]) => ({ day, data }));

  // Comes back with the Entry Jump left marked, and keeps the mark in view.
  useEffect(() => setMarked(search.at), [search.at]);
  useEffect(() => {
    const section = days.findIndex(([, each]) =>
      each.some((entry) => entry.id === marked),
    );
    const item = days[section]?.[1].findIndex((entry) => entry.id === marked);
    if (section < 0 || item === undefined) return;
    list.current?.scrollToLocation({
      sectionIndex: section,
      itemIndex: item,
      viewPosition: 0.4,
    });
    // Only a new mark scrolls; the list changing under it does not.
  }, [marked]);

  const at = shown.findIndex((entry) => entry.id === marked);
  const mark = (index: number) =>
    setMarked(shown[Math.max(0, Math.min(index, shown.length - 1))]?.id);
  const open = (id: string) =>
    router.push({
      pathname: '/entries/[entryId]',
      params: { entryId: id, ...narrowing(search) },
    });
  const forget = useRemoveEntry((entry) => setMarked(entry.id));
  // Deletes an Entry, marking the one after it if it was marked.
  const remove = (entry: Entry) => {
    removed.current = entry;
    setMarked(markAfterRemoving(shown, entry, marked));
    forget(entry);
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
  useCommand('entries.open', () => marked && open(marked), {
    enabled: active && marked !== undefined,
  });
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
      setMarked(entry.id);
    },
    { enabled: active },
  );

  const narrowed = narrowedTo(money, search);
  return (
    <SectionList
      ref={list}
      sections={sections}
      keyExtractor={(entry) => entry.id}
      stickySectionHeadersEnabled
      contentContainerClassName="px-2 pb-28"
      onScrollToIndexFailed={() => {}}
      ListHeaderComponent={
        narrowed === undefined ? null : (
          <View className="flex-row items-center justify-between gap-2 px-2 pt-4">
            <Text
              weight="medium"
              numberOfLines={1}
              className="min-w-0 flex-1 text-sm"
            >
              {narrowed}
            </Text>
            <View className="flex-row items-center gap-1">
              {search.account && (
                <Button
                  size="sm"
                  variant="ghost"
                  labelClassName="text-muted-foreground"
                  startContent={<Glyph icon={PencilEdit01Icon} size={14} />}
                  onPress={() => openAccount(search.account)}
                >
                  Rename
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                labelClassName="text-muted-foreground"
                endContent={<Glyph icon={Cancel01Icon} size={14} />}
                onPress={() => router.navigate('/entries')}
              >
                Everything
              </Button>
            </View>
          </View>
        )
      }
      ListEmptyComponent={
        money.ready ? (
          <View className="items-center gap-3 px-6 py-20">
            <Glyph icon={InboxIcon} size={32} />
            <Text muted className="text-sm">
              No entries here yet.
            </Text>
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) => (
        <View className="mt-4 flex-row items-center justify-between bg-background px-3 py-1.5">
          <Text muted className="text-xs">
            {dayName(section.day)}
          </Text>
          <Amount
            cents={section.data.reduce(
              (sum, entry) => sum + signed(entry.cents, entry.way),
              0,
            )}
            currency={currency}
            className="text-xs text-muted-foreground"
          />
        </View>
      )}
      renderItem={({ item: entry }) => (
        <SwipeRow onDelete={() => remove(entry)} haptics={settings.haptics}>
          <EntryRow
            entry={entry}
            category={lookup.category.get(entry.categoryId)}
            account={lookup.account.get(entry.accountId)}
            currency={currency}
            marked={entry.id === marked}
            onPress={() => {
              setMarked(entry.id);
              open(entry.id);
            }}
          />
        </SwipeRow>
      )}
    />
  );
}
