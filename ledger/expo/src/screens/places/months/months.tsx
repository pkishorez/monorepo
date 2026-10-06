import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import { Glyph } from '@kstackz/expo-toolkit/components/glyph';
import { Meter } from '@kstackz/expo-toolkit/components/meter';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { cn } from '@kstackz/expo-toolkit/theme';
import { keys, useCommand, usePlace } from '@ledger/core/client/commands';
import { useMoney } from '@ledger/core/client/session';
import { monthsView } from '@ledger/core/client/views';
import { monthName } from '@ledger/core/shared/ledger';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Amount, Scroll } from '../../parts';

/**
 * Months, a Place: each with what came in and went out, and what was left.
 * A tap opens one. It is The List of a Month: Jump comes back to it with
 * that Month marked.
 */
export function Months(props: { readonly at: string | undefined }) {
  usePlace('months');
  const money = useMoney();
  const router = useRouter();
  const { surface } = keys.useSurface();
  const { months, most } = monthsView(money);
  const [marked, setMarked] = useState(props.at);
  const currency = money.currency;
  useEffect(() => setMarked(props.at), [props.at]);

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

  if (money.ready && months.length === 0) {
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
    <Scroll className="gap-2">
      {months.map((month) => {
        const left = month.in - month.out;
        return (
          <Pressable
            key={month.month}
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
    </Scroll>
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
