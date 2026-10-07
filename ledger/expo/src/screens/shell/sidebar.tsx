import PlusSignIcon from '@hugeicons/core-free-icons/PlusSignIcon';
import { Glyph } from '@kstackz/expo-toolkit/components/glyph';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { Sidebar, useSidebar } from '@kstackz/expo-toolkit/recipes/sidebar';
import { PLACES, type StopIcon as Icon } from '@ledger/core/app/places';
import { useMoney } from '@ledger/core/app/session';
import { balances } from '@ledger/core/model';
import {
  type Href,
  useGlobalSearchParams,
  usePathname,
  useRouter,
} from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Amount, StopIcon } from '../parts';
import { useOpenAccount } from '../sheets/accounts';
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
  const openAccount = useOpenAccount();
  const addAccount = () => {
    setOpen(false);
    openAccount();
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
      {money.ready && (
        <View className="mt-5 gap-0.5">
          <View className="flex-row items-center justify-between pl-3">
            <Text muted className="text-xs">
              Accounts
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add an account"
              onPress={addAccount}
              className="size-8 items-center justify-center rounded-md active:bg-muted"
            >
              <Glyph icon={PlusSignIcon} size={16} />
            </Pressable>
          </View>
          {money.accounts.length === 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={addAccount}
              className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-muted"
            >
              <Glyph icon={PlusSignIcon} size={18} />
              <Text muted className="text-sm">
                Add an account
              </Text>
            </Pressable>
          )}
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
