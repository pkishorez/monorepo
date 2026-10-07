import Logout01Icon from '@hugeicons/core-free-icons/Logout01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import UnfoldMoreIcon from '@hugeicons/core-free-icons/UnfoldMoreIcon';
import UserAdd01Icon from '@hugeicons/core-free-icons/UserAdd01Icon';
import { Glyph } from '@kstackz/expo-toolkit/components/glyph';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { toast } from '@kstackz/expo-toolkit/components/toast';
import { type User, useUser } from '@ledger/core/app/session';
import { type ReactNode, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useAccounts, useGate } from '../../ledger';
import { LedgerMark } from '../parts';

function UserAvatar(props: { readonly user: User }) {
  if (props.user.image)
    return (
      <Image
        source={{ uri: props.user.image }}
        className="size-7 rounded-full"
      />
    );
  return (
    <View className="size-7 items-center justify-center rounded-full bg-muted">
      <Text weight="medium" className="text-xs">
        {props.user.name.slice(0, 1)}
      </Text>
    </View>
  );
}

function Choice(props: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      className="flex-row items-center gap-3 rounded-lg px-2 py-2 active:bg-muted disabled:opacity-50"
    >
      {props.children}
    </Pressable>
  );
}

const failed = (label: string) =>
  toast.show({ variant: 'destructive', label, placement: 'top' });

/**
 * Ledger and whose Session is open, atop the Sidebar. A tap lists every
 * User signed in on this phone, to Switch User, Add User, or Sign Out the
 * open one; both of the last need the network.
 */
export function UserSwitcher(props: { readonly onDone: () => void }) {
  const user = useUser();
  const { current: account, all, add, switchTo, signOut } = useAccounts();
  const { online, notice, dismissNotice } = useGate();
  const [open, setOpen] = useState(false);
  // Why an Add User came back without one, unless the sheet was closed.
  useEffect(() => {
    if (notice?.kind !== 'loginError') return;
    failed(
      notice.error.description ?? 'Adding a user didn’t finish. Try again.',
    );
    dismissNotice();
  }, [notice, dismissNotice]);
  // Opened before the Backend answered, the open User has no token to sign
  // out with yet; and only the Backend can sign anyone out.
  const reached = online && account.token !== null;
  const done = (run: () => unknown) => () => {
    setOpen(false);
    props.onDone();
    void run();
  };
  return (
    <View className="gap-1 px-3 pb-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Users: ${user.name} is open`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
        className="flex-row items-center gap-3 rounded-lg px-2 py-2 active:bg-muted"
      >
        <LedgerMark size={28} />
        <View className="flex-1">
          <Text weight="medium" className="text-sm">
            Ledger
          </Text>
          <Text muted numberOfLines={1} className="text-xs">
            {user.name}
          </Text>
        </View>
        <Glyph icon={UnfoldMoreIcon} size={16} />
      </Pressable>
      {open && (
        <View className="gap-0.5 rounded-xl border border-border bg-card p-1">
          <Text muted className="px-2 pt-1 pb-0.5 text-xs">
            Signed in on this phone
          </Text>
          {all.map(({ user: other }) => (
            <Choice
              key={other.id}
              label={`Switch to ${other.name}`}
              onPress={done(() => switchTo(other.id))}
            >
              <UserAvatar user={other} />
              <View className="flex-1">
                <Text numberOfLines={1} className="text-sm">
                  {other.name}
                </Text>
                <Text muted numberOfLines={1} className="text-xs">
                  {other.email}
                </Text>
              </View>
              {other.id === user.id && (
                <Glyph icon={Tick02Icon} size={16} tone="foreground" />
              )}
            </Choice>
          ))}
          <View className="my-1 h-px bg-border" />
          <Choice
            label="Add user"
            disabled={!online}
            onPress={done(() =>
              add().catch(() =>
                failed('Couldn’t start adding a user. Try again.'),
              ),
            )}
          >
            <Glyph icon={UserAdd01Icon} size={18} />
            <Text className="text-sm">Add user</Text>
          </Choice>
          <Choice
            label={`Sign out ${user.name}`}
            disabled={!reached}
            onPress={done(signOut)}
          >
            <Glyph icon={Logout01Icon} size={18} />
            <Text numberOfLines={1} className="flex-1 text-sm">
              Sign out {user.name}
            </Text>
          </Choice>
        </View>
      )}
    </View>
  );
}
