import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import InboxIcon from '@hugeicons/core-free-icons/InboxIcon';
import PencilEdit01Icon from '@hugeicons/core-free-icons/PencilEdit01Icon';
import { Button } from '@kstackz/expo-platform/components/button';
import { Glyph } from '@kstackz/expo-platform/components/glyph';
import { Text } from '@kstackz/expo-platform/components/text';
import { SwipeRow } from '@kstackz/expo-platform/recipes/swipe-row';
import { cn } from '@kstackz/expo-platform/theme';
import { keys, useCommand, usePlace } from '@ledger/core/app/commands';
import { useMoney, useWrites } from '@ledger/core/app/session';
import {
  type EntriesSearch,
  markAfterRemoving,
  narrowedTo,
  narrowing,
  shownBy,
  useLookup,
} from '@ledger/core/app/places';
import {
  type Account,
  byDay,
  type Category,
  dayName,
  type Entry,
  signed,
} from '@ledger/core/model';
import { useRouter } from 'expo-router';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFeel } from '../../../ledger';
import { useOpenAccount } from '../../sheets/accounts';
import { Amount, EntryRow } from '../../parts';
import { useRemoveEntry } from './remove';

// One line of the list: a day's heading, or one of its Entries.
type Line =
  | { readonly kind: 'day'; readonly day: string; readonly cents: number }
  | { readonly kind: 'entry'; readonly entry: Entry };

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
  const feel = useFeel();
  const { surface } = keys.useSurface();
  const shown = shownBy(money.entries, search);
  const [marked, setMarked] = useState(search.at);
  const removed = useRef<Entry>(undefined);
  const list = useRef<FlashListRef<Line>>(null);
  const openAccount = useOpenAccount();
  const currency = money.currency;
  // Every day's heading followed by its Entries.
  const lines = useMemo(() => {
    const lines: Array<Line> = [];
    for (const [day, data] of byDay(shown)) {
      lines.push({
        kind: 'day',
        day,
        cents: data.reduce(
          (sum, entry) => sum + signed(entry.cents, entry.way),
          0,
        ),
      });
      for (const entry of data) lines.push({ kind: 'entry', entry });
    }
    return lines;
  }, [shown]);

  // Comes back with the Entry Jump left marked, and keeps the mark in view,
  // drawn or not.
  useEffect(() => setMarked(search.at), [search.at]);
  const scrollToMark = () => {
    const index = lines.findIndex(
      (line) => line.kind === 'entry' && line.entry.id === marked,
    );
    if (index < 0) return;
    void list.current?.scrollToIndex({ index, viewPosition: 0.4 });
  };
  // Only a new mark scrolls; the list changing under it does not.
  useEffect(scrollToMark, [marked]);

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

  // What a row does, made once and read through the latest render, so a
  // row is drawn again only when its own Entry or mark changes.
  const latest = useRef({ remove, open, setMarked, feel });
  latest.current = { remove, open, setMarked, feel };
  const acts = useRef<RowActs>({
    remove: (entry) => latest.current.remove(entry),
    open: (id) => {
      latest.current.setMarked(id);
      latest.current.open(id);
    },
    arm: () => latest.current.feel('arm'),
    commit: () => latest.current.feel('delete'),
  }).current;
  const renderItem = useCallback(
    ({ item: line }: { readonly item: Line }) =>
      line.kind === 'day' ? (
        <DayHeader day={line.day} cents={line.cents} currency={currency} />
      ) : (
        <Row
          entry={line.entry}
          category={lookup.category.get(line.entry.categoryId)}
          account={lookup.account.get(line.entry.accountId)}
          currency={currency}
          marked={line.entry.id === marked}
          acts={acts}
        />
      ),
    [lookup, currency, marked, acts],
  );

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
  const undo = () => {
    const entry = removed.current;
    if (entry === undefined) return;
    removed.current = undefined;
    restoreEntry(entry);
    setMarked(entry.id);
  };
  useCommand('entries.undo', undo, { enabled: active });

  // The day at the top, pinned there once the list has scrolled.
  const pinned = usePinnedDay(lines);
  const narrowed = narrowedTo(money, search);
  return (
    <View className="flex-1">
      <FlashList
        ref={list}
        data={lines}
        keyExtractor={keyOf}
        getItemType={kindOf}
        onScroll={pinned.onScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={pinned.onViewableItemsChanged}
        viewabilityConfig={VIEWABLE}
        contentContainerStyle={{ paddingBottom: 112 }}
        ListHeaderComponent={
          narrowed === undefined ? null : (
            <View className="flex-row items-center justify-between gap-2 px-4 pt-4">
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
            <View className="items-center gap-3 px-8 py-20">
              <Glyph icon={InboxIcon} size={32} />
              <Text muted className="text-sm">
                No entries here yet.
              </Text>
            </View>
          ) : null
        }
        renderItem={renderItem}
      />
      {pinned.day && (
        <View pointerEvents="none" className="absolute inset-x-0 top-0">
          <DayHeader
            day={pinned.day.day}
            cents={pinned.day.cents}
            currency={currency}
            pinned
          />
        </View>
      )}
    </View>
  );
}

// A line counts as on screen with any of it showing.
const VIEWABLE = { itemVisiblePercentThreshold: 1 };

/**
 * The day whose lines are at the top of the list, kept pinned over it once
 * it has scrolled: FlashList's own sticky headers (2.0.2) pin a heading
 * from rows not yet measured, so pick the wrong day.
 */
const usePinnedDay = (lines: ReadonlyArray<Line>) => {
  const [first, setFirst] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) =>
      setScrolled(event.nativeEvent.contentOffset.y > 0),
    [],
  );
  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: ReadonlyArray<{ index: number | null }> }) => {
      const indexes = info.viewableItems
        .map((item) => item.index)
        .filter((index): index is number => index !== null);
      if (indexes.length > 0) setFirst(Math.min(...indexes));
    },
    [],
  );
  let day: Extract<Line, { kind: 'day' }> | undefined;
  for (let at = Math.min(first, lines.length - 1); at >= 0; at--) {
    const line = lines[at];
    if (line?.kind === 'day') {
      day = line;
      break;
    }
  }
  return { day: scrolled ? day : undefined, onScroll, onViewableItemsChanged };
};

const keyOf = (line: Line) =>
  line.kind === 'day' ? `day-${line.day}` : line.entry.id;
const kindOf = (line: Line) => line.kind;

// A day's heading, with what moved that day; drawn again only when it changes.
const DayHeader = memo(function DayHeader(props: {
  readonly day: string;
  readonly cents: number;
  readonly currency: string;
  /** Pinned at the top of the list, with no gap above it. */
  readonly pinned?: boolean;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center justify-between bg-background px-5 py-1.5',
        !props.pinned && 'mt-4',
      )}
    >
      <Text muted className="text-xs">
        {dayName(props.day)}
      </Text>
      <Amount
        cents={props.cents}
        currency={props.currency}
        className="text-xs text-muted-foreground"
      />
    </View>
  );
});

type RowActs = {
  readonly remove: (entry: Entry) => void;
  readonly open: (id: string) => void;
  readonly arm: () => void;
  readonly commit: () => void;
};

// One Entry, swiped left to delete; drawn again only when its props change.
const Row = memo(function Row(props: {
  readonly entry: Entry;
  readonly category: Category | undefined;
  readonly account: Account | undefined;
  readonly currency: string;
  readonly marked: boolean;
  readonly acts: RowActs;
}) {
  const { entry, acts } = props;
  return (
    <SwipeRow
      item={entry.id}
      className="mx-2"
      onArm={acts.arm}
      onCommit={acts.commit}
      onDelete={() => acts.remove(entry)}
    >
      <EntryRow
        entry={entry}
        category={props.category}
        account={props.account}
        currency={props.currency}
        marked={props.marked}
        onPress={() => acts.open(entry.id)}
      />
    </SwipeRow>
  );
});
