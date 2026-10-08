import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import { Glyph } from '@kstackz/expo-platform/components/glyph';
import { Meter } from '@kstackz/expo-platform/components/meter';
import { Text } from '@kstackz/expo-platform/components/text';
import { cn } from '@kstackz/expo-platform/theme';
import { keys, useCommand, usePlace } from '@ledger/core/commands';
import { useCurrency, useMonths } from '@ledger/core/queries';
import { monthName } from '@ledger/core/model';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Amount } from '../../parts';

// Room kept above and below the marked card when it is scrolled to; the
// foot also clears the Add button.
const ROOM = { top: 16, bottom: 112 } as const;

type Box = { readonly y: number; readonly height: number };

// Keeps the marked Month in view, scrolling no more than needed (the web's
// `scrollIntoView({ block: 'nearest' })`). A card not laid out yet is
// scrolled to when it is.
function useMarkInView(marked: string | undefined) {
  const list = useRef<ScrollView>(null);
  const boxes = useRef(new Map<string, Box>());
  const view = useRef({ top: 0, height: 0 });
  const pending = useRef<string | undefined>(undefined);

  const reveal = (month: string) => {
    const box = boxes.current.get(month);
    const { top, height } = view.current;
    if (box === undefined || height === 0) {
      pending.current = month;
      return;
    }
    pending.current = undefined;
    const above = box.y - ROOM.top;
    const below = box.y + box.height + ROOM.bottom - height;
    if (above < top) list.current?.scrollTo({ y: Math.max(0, above) });
    else if (below > top) list.current?.scrollTo({ y: below });
  };

  // Only a new mark scrolls; the list changing under it does not.
  useEffect(() => {
    if (marked !== undefined) reveal(marked);
  }, [marked]);

  return {
    ref: list,
    onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      view.current.top = event.nativeEvent.contentOffset.y;
    },
    onLayout: (event: { nativeEvent: { layout: { height: number } } }) => {
      view.current.height = event.nativeEvent.layout.height;
      if (pending.current !== undefined) reveal(pending.current);
    },
    card: (month: string) => (event: { nativeEvent: { layout: Box } }) => {
      boxes.current.set(month, event.nativeEvent.layout);
      if (pending.current === month) reveal(month);
    },
  };
}

/**
 * Months, a Place: each with what came in and went out, and what was left.
 * A tap opens one. It is The List of a Month: Jump comes back to it with
 * that Month marked.
 */
export function Months(props: { readonly at: string | undefined }) {
  usePlace('months');
  const router = useRouter();
  const { surface } = keys.useSurface();
  const { ready, months, most } = useMonths();
  const [marked, setMarked] = useState(props.at);
  const currency = useCurrency();
  useEffect(() => setMarked(props.at), [props.at]);
  const inView = useMarkInView(marked);

  const at = months.findIndex((month) => month.month === marked);
  const active = surface === 'months';
  const open = (month: string) => router.push(`/months/${month}`);
  useCommand('next', () => setMarked(months[at + 1]?.month), {
    enabled: active && at < months.length - 1,
  });
  useCommand('previous', () => setMarked(months[at - 1]?.month), {
    enabled: active && at > 0,
  });
  useCommand('months.open', () => marked && open(marked), {
    enabled: active && marked !== undefined,
  });

  if (ready && months.length === 0) {
    return (
      <View className="items-center gap-3 px-6 py-24">
        <Glyph icon={Calendar03Icon} size={32} />
        <Text muted className="text-center text-sm">
          Months show up once there are entries.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView
      ref={inView.ref}
      onScroll={inView.onScroll}
      scrollEventThrottle={32}
      onLayout={inView.onLayout}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-2 px-4 pt-5 pb-28"
    >
      {months.map((month) => {
        const { left } = month;
        return (
          <Pressable
            key={month.month}
            onLayout={inView.card(month.month)}
            accessibilityRole="button"
            accessibilityLabel={monthName(month.month)}
            accessibilityState={{ selected: month.month === marked }}
            onPress={() => {
              setMarked(month.month);
              open(month.month);
            }}
            className={cn(
              'gap-3 rounded-lg border border-border p-4 active:bg-muted',
              month.month === marked && 'bg-muted',
            )}
          >
            <View className="flex-row items-baseline justify-between gap-3">
              <Text weight="medium" className="text-sm">
                {monthName(month.month)}
              </Text>
              <Text muted className="text-sm">
                Left{' '}
                <Amount
                  cents={left}
                  currency={currency}
                  className={cn(
                    'text-sm font-medium',
                    left < 0 && 'text-destructive',
                  )}
                />
              </Text>
            </View>
            <View className="gap-1.5">
              <Line
                cents={month.in}
                of={most}
                tone="soft"
                currency={currency}
              />
              <Line
                cents={month.out}
                of={most}
                tone="medium"
                currency={currency}
              />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Line(props: {
  readonly cents: number;
  readonly of: number;
  readonly tone: 'soft' | 'medium';
  readonly currency: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Meter
        value={props.cents / props.of}
        tone={props.tone}
        className="h-1 flex-1"
      />
      <Amount
        cents={props.cents}
        currency={props.currency}
        compact
        className="w-16 text-right text-xs text-muted-foreground"
      />
    </View>
  );
}
