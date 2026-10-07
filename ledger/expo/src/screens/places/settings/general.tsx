import Moon02Icon from '@hugeicons/core-free-icons/Moon02Icon';
import Sun03Icon from '@hugeicons/core-free-icons/Sun03Icon';
import { Button } from '@kstackz/expo-toolkit/components/button';
import { Choice } from '@kstackz/expo-toolkit/components/choice';
import { Dialog } from '@kstackz/expo-toolkit/components/dialog';
import { Switch } from '@kstackz/expo-toolkit/components/switch';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { useMoney, useUser, useWrites } from '@ledger/core/app/session';
import { CURRENCIES } from '@ledger/core/model';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useState } from 'react';
import { View } from 'react-native';
import {
  useAccounts,
  useAppTheme,
  useGate,
  useSettings,
} from '../../../ledger';
import { Flip, Group, Row } from './rows';

/**
 * Settings' General Section: how Ledger looks and feels on this
 * phone, the app's version, the User's money, and who is signed in.
 */
export function General() {
  return (
    <View className="gap-10">
      <LookAndFeel />
      <App />
      <Data />
      <Users />
    </View>
  );
}

function LookAndFeel() {
  const { theme, setTheme } = useAppTheme();
  const [settings, change] = useSettings();
  return (
    <Group title="Look and feel">
      <Row label="Theme">
        <Flip
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'Light', icon: Sun03Icon },
            { value: 'dark', label: 'Dark', icon: Moon02Icon },
          ]}
        />
      </Row>
      <Row
        label="Haptics"
        hint="A light tap as a gesture moves you: each step of the Thumb Lock, the Sidebar, a page, a row swiped to delete."
      >
        <Switch
          value={settings.haptics}
          onValueChange={(haptics) => change({ haptics })}
          label="Haptics"
        />
      </Row>
    </Group>
  );
}

// Which build runs, as the web's "Deployed … · commit": Expo Go, or the
// build's number, and the commit Metro bundled (set by `pnpm start`).
const BUILT = [
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? 'Expo Go'
    : Constants.nativeBuildVersion && `Build ${Constants.nativeBuildVersion}`,
  process.env.EXPO_PUBLIC_COMMIT,
]
  .filter(Boolean)
  .join(' · ');

// The web's App rows: there is nothing to install on a phone, so only the
// version this app runs; updates come from the store.
function App() {
  return (
    <Group title="App">
      <Row label="Version" hint={BUILT || undefined}>
        <Text muted className="text-sm">
          {Constants.expoConfig?.version ?? '—'}
        </Text>
      </Row>
    </Group>
  );
}

function Data() {
  const money = useMoney();
  const { sample, clear, setCurrency } = useWrites();
  const { online, backend } = useGate();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
      setSure(false);
    }
  };
  return (
    <Group title="Your money">
      <Text muted className="pb-1 text-sm">
        {money.entries.length} entries in {money.accounts.length} accounts,
        {backend === 'device'
          ? ' kept on this phone only.'
          : ' kept on this phone and in your account.'}
      </Text>
      <View className="gap-2 py-3">
        <Text className="text-sm">Currency</Text>
        <Choice
          bleed={16}
          label="Currency"
          value={money.currency}
          onChange={setCurrency}
          options={CURRENCIES.map((currency) => ({
            value: currency,
            label: currency,
          }))}
        />
      </View>
      <View className="flex-row flex-wrap gap-2 pt-3">
        {money.accounts.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={!online || busy}
            onPress={() => void act(() => sample(true))}
          >
            Load sample money
          </Button>
        )}
        {money.accounts.length > 0 && (
          <Button
            variant={sure ? 'destructive' : 'outline'}
            size="sm"
            disabled={!online || busy}
            onPress={() => (sure ? void act(clear) : setSure(true))}
          >
            {sure ? 'Delete everything, for good' : 'Delete everything'}
          </Button>
        )}
      </View>
    </Group>
  );
}

function Users() {
  const user = useUser();
  const { backend, setBackend } = useGate();
  const { manage } = useAccounts();
  return (
    <Group title="Users">
      <Row
        label="Backend"
        hint="Cloud keeps your money for every device, with Google to sign in. Device keeps it on this phone only, with anyone to sign in as. Each keeps its own users."
      >
        <Flip
          value={backend ?? 'cloud'}
          onChange={(next) => void setBackend(next)}
          options={[
            { value: 'cloud', label: 'Cloud' },
            { value: 'device', label: 'Device' },
          ]}
        />
      </Row>
      {backend === 'cloud' && (
        <Row
          label="Manage Google accounts"
          hint={`Where ${user.email} is signed in, and the apps it lets in, at the sign-in service.`}
        >
          <Button variant="outline" size="sm" onPress={() => void manage()}>
            Manage
          </Button>
        </Row>
      )}
      <Row
        label="Sign out everyone"
        hint="Every user leaves this phone, and their money leaves it too."
      >
        <SignOutEveryone />
      </Row>
    </Group>
  );
}

function SignOutEveryone() {
  const { online } = useGate();
  const [open, setOpen] = useState(false);
  const { all, signOutEveryone } = useAccounts();
  const count = all.length;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button variant="outline" size="sm" disabled={!online || count === 0}>
          Sign out everyone
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Title>
          {count === 1 ? 'Sign out?' : `Sign out all ${count} users?`}
        </Dialog.Title>
        <Dialog.Description>
          Each one’s money leaves this phone and stays in their account.
        </Dialog.Description>
        <Dialog.Footer>
          <Button variant="outline" onPress={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onPress={() => {
              setOpen(false);
              signOutEveryone();
            }}
          >
            Sign out everyone
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
