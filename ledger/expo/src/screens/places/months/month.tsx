import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import { Button } from '@kstackz/expo-platform/components/button';
import { Glyph } from '@kstackz/expo-platform/components/glyph';
import { Meter } from '@kstackz/expo-platform/components/meter';
import { Text } from '@kstackz/expo-platform/components/text';
import { cn } from '@kstackz/expo-platform/theme';
import { keys, useCommand, usePlace } from '@ledger/core/app/commands';
import { useMoney } from '@ledger/core/app/session';
import { monthView } from '@ledger/core/app/places';
import { type MonthKey, monthName } from '@ledger/core/model';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Amount, CategoryIcon, Heading, Scroll, useToneOf } from '../../parts';

/**
 * A Month, a Place just under Months: what came in, what went out, each
 * day's spending, and where it went by Category against its Budget. Next
 * and Previous turn the Month, never past this one or before the first;
 * Jump goes to the Months.
 */
export function Month(props: { readonly month: MonthKey }) {
  usePlace('months.month');
  const { month } = props;
  const money = useMoney();
  const router = useRouter();
  const currency = money.currency;
  const toneOf = useToneOf();
  const { summary, left, later, earlier, hasLater, hasEarlier, days, peak } =
    monthView(money, month);
  const turn = (to: string) => router.replace(`/months/${to}`);
  const back = () =>
    router.navigate({ pathname: '/months', params: { at: month } });
  const entries = (category?: string) =>
    router.push({
      pathname: '/entries',
      params: category === undefined ? { month } : { month, category },
    });

  const active = keys.useSurface().surface === 'months.month';
  useCommand('next', () => turn(later), { enabled: active && hasLater });
  useCommand('previous', () => turn(earlier), {
    enabled: active && hasEarlier,
  });
  useCommand('jump', back, { enabled: active });
  useCommand('months.month.back', back);
  useCommand('months.month.open', () => entries());

  return (
    <Scroll className="gap-10">
      <View className="flex-row items-center gap-1">
        <Text
          weight="semibold"
          accessibilityRole="header"
          className="flex-1 text-xl tracking-tight"
        >
          {monthName(month)}
        </Text>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Earlier month"
          disabled={!hasEarlier}
          onPress={() => turn(earlier)}
        >
          <Glyph icon={ArrowLeft01Icon} color={toneOf(hasEarlier)} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Later month"
          disabled={!hasLater}
          onPress={() => turn(later)}
        >
          <Glyph icon={ArrowRight01Icon} color={toneOf(hasLater)} />
        </Button>
      </View>

      <View className="flex-row gap-2">
        <Stat label="In" cents={summary.in} currency={currency} />
        <Stat label="Out" cents={summary.out} currency={currency} />
        <Stat
          label="Left"
          cents={left}
          currency={currency}
          className={left < 0 ? 'text-destructive' : undefined}
        />
      </View>

      <View className="gap-3">
        <Heading title="Each day" />
        <View
          accessibilityLabel="Money out each day"
          className="h-28 flex-row items-end gap-[3px]"
        >
          {days.map((cents, i) => (
            <View
              key={i}
              className={cn(
                'flex-1 rounded-t-sm',
                cents > 0 ? 'bg-foreground/60' : 'bg-muted',
              )}
              style={{ height: `${Math.max(3, (cents / peak) * 100)}%` }}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Heading
          title="Where it went"
          more={{ label: 'Its entries', onPress: () => entries() }}
        />
        {summary.spent.length === 0 && (
          <Text muted className="text-sm">
            Nothing went out this month.
          </Text>
        )}
        <View className="-mx-2 gap-1">
          {summary.spent.map(({ category, cents }) => {
            const budget = category.budget;
            const of = Math.max(cents, budget, 1);
            return (
              <Pressable
                key={category.id}
                accessibilityRole="link"
                accessibilityLabel={`${category.name} entries`}
                onPress={() => entries(category.id)}
                className="flex-row items-center gap-3 rounded-lg px-2 py-2.5 active:bg-muted"
              >
                <CategoryIcon icon={category.icon} />
                <View className="min-w-0 flex-1 gap-1.5">
                  <View className="flex-row items-baseline justify-between gap-2">
                    <Text className="text-sm">{category.name}</Text>
                    <Text muted className="text-sm">
                      <Amount
                        cents={cents}
                        currency={currency}
                        className="text-sm"
                      />
                      {budget > 0 && (
                        <>
                          {' of '}
                          <Amount
                            cents={budget}
                            currency={currency}
                            compact
                            className="text-sm text-muted-foreground"
                          />
                        </>
                      )}
                    </Text>
                  </View>
                  <Meter
                    value={cents / of}
                    tone={
                      cents > budget && budget > 0 ? 'destructive' : 'medium'
                    }
                    {...(budget > 0 ? { mark: budget / of } : {})}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Scroll>
  );
}

function Stat(props: {
  readonly label: string;
  readonly cents: number;
  readonly currency: string;
  readonly className?: string | undefined;
}) {
  return (
    <View className="flex-1 gap-1 rounded-lg border border-border p-3">
      <Text muted className="text-xs">
        {props.label}
      </Text>
      <Amount
        cents={props.cents}
        currency={props.currency}
        compact
        className={cn('text-base font-semibold', props.className)}
      />
    </View>
  );
}
