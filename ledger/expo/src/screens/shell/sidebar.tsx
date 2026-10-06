import { Text } from '@kstackz/expo-toolkit/components/text';
import { Sidebar, useSidebar } from '@kstackz/expo-toolkit/patterns/sidebar';
import { PLACES, type StopIcon as Icon } from '@ledger/core/client/places';
import { useMoney } from '@ledger/core/client/session';
import { balances } from '@ledger/core/shared/ledger';
import {
  type Href,
  useGlobalSearchParams,
  usePathname,
  useRouter,
} from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Amount, StopIcon } from '../parts';
import { UserSwitcher } from './user-switcher';

// Every Place but Settings, which sits at the foot of the Sidebar.
const TOP = PLACES.filter((place) => place.id !== 'settings');
const SETTINGS = PLACES.find((place) => place.id === 'settings');

function Row(props: {
  readonly label: string;
  readonly icon: Icon;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly end?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.active }}
      onPress={props.onPress}
      className={
        props.active
          ? 'flex-row items-center gap-3 rounded-lg bg-muted px-3 py-2.5'
          : 'flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-muted'
      }
    >
      <StopIcon
        name={props.icon}
        size={18}
        tone={props.active ? 'foreground' : 'muted-foreground'}
      />
      <Text numberOfLines={1} className="flex-1 text-sm">
        {props.label}
      </Text>
      {props.end}
    </Pressable>
  );
}

/**
 * The Sidebar, beside every Place: the User Switcher at its top, the Places
 * to Go to, then each Account with its balance; Settings at its foot. Going
 * anywhere shuts it.
 */
export function LedgerSidebar() {
  const { setOpen } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const { account } = useGlobalSearchParams<{ account?: string }>();
  const money = useMoney();
  const balance = balances(money.accounts, money.entries);
  const here = (to: string) =>
    (to === '/' ? pathname === '/' : pathname.startsWith(to)) &&
    account === undefined;
  const go = (href: Href) => {
    setOpen(false);
    router.navigate(href);
  };

  return (
    <Sidebar
      header={<UserSwitcher onDone={() => setOpen(false)} />}
      footer={
        SETTINGS && (
          <View className="flex-1">
            <Row
              label={SETTINGS.label}
              icon="settings"
              active={here(SETTINGS.to)}
              onPress={() => go(SETTINGS.to)}
            />
          </View>
        )
      }
    >
      <View className="gap-0.5">
        {TOP.map((place) => (
          <Row
            key={place.id}
            label={place.label}
            icon={place.id}
            active={here(place.to)}
            onPress={() => go(place.to)}
          />
        ))}
      </View>
      {money.ready && money.accounts.length > 0 && (
        <View className="mt-5 gap-0.5">
          <Text muted className="px-3 pb-1 text-xs">
            Accounts
          </Text>
          {money.accounts.map((each) => (
            <Row
              key={each.id}
              label={each.name}
              icon={each.kind}
              active={account === each.id}
              onPress={() =>
                go({ pathname: '/entries', params: { account: each.id } })
              }
              end={
                <Amount
                  cents={balance.get(each.id) ?? 0}
                  currency={money.currency}
                  className="text-xs text-muted-foreground"
                />
              }
            />
          ))}
        </View>
      )}
    </Sidebar>
  );
}
