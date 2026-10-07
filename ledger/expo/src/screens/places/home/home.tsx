import { Button } from '@kstackz/expo-platform/components/button';
import { Meter } from '@kstackz/expo-platform/components/meter';
import { Text } from '@kstackz/expo-platform/components/text';
import { cn } from '@kstackz/expo-platform/theme';
import { keys, useCommand, usePlace } from '@ledger/core/commands';
import { type Money, useMoney, useUser, useWrites } from '@ledger/core/session';
import { glance, useLookup } from '@ledger/core/places';
import { monthName, monthOf, today } from '@ledger/core/model';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useGate } from '../../../ledger';
import {
  Amount,
  CategoryIcon,
  EntryRow,
  Heading,
  LedgerMark,
  Scroll,
} from '../../parts';

/**
 * Home, a Place: this Month at a glance, or a welcome for a new User. Jump
 * goes to Entries; opening it goes to this Month.
 */
export function Home() {
  usePlace('home');
  const money = useMoney();
  const router = useRouter();
  const month = monthOf(today());
  const active = keys.useSurface().surface === 'home';
  useCommand('jump', () => router.navigate('/entries'), { enabled: active });
  useCommand('home.open', () => router.navigate(`/months/${month}`));
  // Nothing until the copy is read: no frame of `$0.00`, no Welcome flash.
  if (!money.ready) return null;
  if (money.accounts.length === 0) return <Welcome />;
  return <Glance money={money} month={month} />;
}

function Glance(props: { readonly money: Money; readonly month: string }) {
  const { money, month } = props;
  const lookup = useLookup(money);
  const router = useRouter();
  const currency = money.currency;
  const { summary, left, budgets, recent, most } = glance(money, month);

  return (
    <Scroll className="gap-10">
      <View className="gap-5">
        <Text muted className="text-sm">
          {monthName(month)}
        </Text>
        <View className="gap-1">
          <Text
            weight="medium"
            muted
            accessibilityRole="header"
            className="text-sm"
          >
            Left this month
          </Text>
          <Amount
            cents={left}
            currency={currency}
            className={cn(
              'text-4xl font-semibold tracking-tight',
              left < 0 && 'text-destructive',
            )}
          />
        </View>
        <View className="gap-2.5">
          <Bar
            label="In"
            cents={summary.in}
            of={most}
            currency={currency}
            tone="soft"
          />
          <Bar
            label="Out"
            cents={summary.out}
            of={most}
            currency={currency}
            tone="strong"
          />
        </View>
      </View>

      {budgets.length > 0 && (
        <View className="gap-3">
          <Heading
            title="Budgets"
            more={{
              label: 'See all',
              onPress: () => router.navigate(`/months/${month}`),
            }}
          />
          <View className="gap-2">
            {budgets.map(({ category, spent }) => {
              const share = spent / category.budget;
              const tone =
                share > 1 ? 'text-destructive' : 'text-muted-foreground';
              return (
                <View
                  key={category.id}
                  className="flex-row items-center gap-3 rounded-lg border border-border p-3"
                >
                  <CategoryIcon icon={category.icon} />
                  <View className="min-w-0 flex-1 gap-1.5">
                    <View className="flex-row items-baseline justify-between gap-2">
                      <Text
                        weight="medium"
                        numberOfLines={1}
                        className="flex-1 text-sm"
                      >
                        {category.name}
                      </Text>
                      <Text className={cn('text-xs', tone)}>
                        <Amount
                          cents={spent}
                          currency={currency}
                          compact
                          className={cn('text-xs', tone)}
                        />{' '}
                        of{' '}
                        <Amount
                          cents={category.budget}
                          currency={currency}
                          compact
                          className={cn('text-xs', tone)}
                        />
                      </Text>
                    </View>
                    <Meter
                      value={share}
                      tone={share > 1 ? 'destructive' : 'medium'}
                      className="h-1"
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View className="gap-2">
        <Heading
          title="Latest"
          more={{
            label: 'See all',
            onPress: () => router.navigate('/entries'),
          }}
        />
        <View className="-mx-3">
          {recent.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              category={lookup.category.get(entry.categoryId)}
              account={lookup.account.get(entry.accountId)}
              currency={currency}
              onPress={() => router.navigate(`/entries/${entry.id}`)}
            />
          ))}
        </View>
      </View>
    </Scroll>
  );
}

function Bar(props: {
  readonly label: string;
  readonly cents: number;
  readonly of: number;
  readonly currency: string;
  readonly tone: 'soft' | 'strong';
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Text muted className="w-8 text-sm">
        {props.label}
      </Text>
      <Meter
        value={props.cents / props.of}
        tone={props.tone}
        className="flex-1"
      />
      <Amount
        cents={props.cents}
        currency={props.currency}
        className="w-28 text-right text-sm"
      />
    </View>
  );
}

// A new User: start from the sample, or from empty Accounts and Categories.
function Welcome() {
  const user = useUser();
  const { sample } = useWrites();
  const { online } = useGate();
  const [busy, setBusy] = useState(false);
  const start = async (entries: boolean) => {
    setBusy(true);
    try {
      await sample(entries);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Scroll className="min-h-full justify-center gap-8 px-6">
      <LedgerMark />
      <View className="gap-3">
        <Text
          weight="semibold"
          accessibilityRole="header"
          className="text-2xl tracking-tight"
        >
          Welcome, {user.name.split(' ')[0]}
        </Text>
        <Text muted>
          Ledger keeps your money in accounts, sorted by what it was for. Start
          with three months of sample money to try every gesture, or start with
          empty accounts.
        </Text>
      </View>
      <View className="gap-2">
        <Button
          size="lg"
          disabled={busy || !online}
          onPress={() => void start(true)}
        >
          Start with sample money
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={busy || !online}
          onPress={() => void start(false)}
        >
          Start empty
        </Button>
      </View>
    </Scroll>
  );
}
